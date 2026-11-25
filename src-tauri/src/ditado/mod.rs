//! Ditado por voz (o Open Whisper, agora dentro do AI Notch): segure o atalho,
//! fale e solte; o texto é colado onde está o cursor.
//!
//! Uma thread própria guarda a máquina de estados (parado → gravando →
//! transcrevendo) e o microfone. O teclado global manda as teclas para ela por
//! um canal; a transcrição roda em outra thread para não travar o atalho.
//! O notch mostra cada fase pelo evento `ditado-estado` (e o volume do
//! microfone por `ditado-nivel`).

mod colar;
pub mod config;
mod gravador;
mod historico;
mod teclado;
mod teclas;
mod transcrever;

use std::collections::HashSet;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Listener};

use config::ConfigDitado;
use gravador::Gravacao;
use teclado::StatusTeclado;

const GRAVACAO_MAXIMA: Duration = Duration::from_secs(15 * 60);
/// Toque mais curto que isso é uso normal do atalho, não ditado.
const TOQUE: Duration = Duration::from_millis(300);
const AUDIO_MINIMO_MS: u64 = 400;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum EstadoDitado {
    Oculto,
    Gravando { travado: bool, inicio: u64 },
    Processando,
    Baixando { progresso: f32 },
    Mensagem { texto: String, erro: bool },
}

enum Msg {
    Tecla(u32, bool),
    Config(ConfigDitado),
    Capturar(bool),
    /// A transcrição terminou (com ou sem sucesso): volta a aceitar o atalho.
    Concluido,
}

#[derive(PartialEq)]
enum Fase {
    Parado,
    Gravando,
    Processando,
}

static CANAL: OnceLock<Sender<Msg>> = OnceLock::new();
static MIDIA: OnceLock<Sender<OpMidia>> = OnceLock::new();
static ESTADO: Mutex<EstadoDitado> = Mutex::new(EstadoDitado::Oculto);
static TECLADO: Mutex<Option<StatusTeclado>> = Mutex::new(None);

fn agora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn emitir(app: &AppHandle, estado: EstadoDitado) {
    if let Ok(mut atual) = ESTADO.lock() {
        atual.clone_from(&estado);
    }
    let _ = app.emit("ditado-estado", estado);
}

// ---- Pausar a música durante o ditado -------------------------------------
// Uma thread só, em fila: "retomar" nunca passa na frente de "pausar".

enum OpMidia {
    /// Pausa se, depois de um instante, a mesma gravação ainda estiver rolando
    /// (um toque rápido no atalho não é ditado e não deve mexer na música).
    Pausar(u64),
    Retomar,
}

/// Gravação atual (0 = nenhuma), para `OpMidia::Pausar` saber se ainda vale.
static GRAVACAO_ATUAL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn midia(op: OpMidia) {
    let canal = MIDIA.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<OpMidia>();
        std::thread::spawn(move || {
            let mut pausei = false;
            for op in rx {
                match op {
                    OpMidia::Pausar(gravacao) => {
                        std::thread::sleep(TOQUE);
                        if GRAVACAO_ATUAL.load(std::sync::atomic::Ordering::Relaxed) == gravacao && !pausei {
                            pausei = crate::midia::pausar_se_tocando();
                        }
                    }
                    OpMidia::Retomar => {
                        if std::mem::take(&mut pausei) {
                            crate::midia::retomar();
                        }
                    }
                }
            }
        });
        tx
    });
    let _ = canal.send(op);
}

fn enviar(msg: Msg) {
    if let Some(canal) = CANAL.get() {
        let _ = canal.send(msg);
    }
}

pub fn iniciar(app: AppHandle) {
    let (tx, rx) = mpsc::channel();
    if CANAL.set(tx.clone()).is_err() {
        return;
    }
    let cfg = config::carregar(&app);

    let tx_teclado = Mutex::new(tx);
    let status = teclado::iniciar(Arc::new(move |codigo, apertada| {
        if let Ok(tx) = tx_teclado.lock() {
            let _ = tx.send(Msg::Tecla(codigo, apertada));
        }
    }));
    if let Ok(mut t) = TECLADO.lock() {
        *t = Some(status);
    }

    // O front salva a config inteira a cada mudança.
    app.listen_any("config-alterada", |evento| {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(evento.payload()) {
            enviar(Msg::Config(ConfigDitado::da_config(&config)));
        }
    });

    std::thread::spawn(move || Maquina::new(app, cfg).rodar(rx));
}

struct Maquina {
    app: AppHandle,
    cfg: ConfigDitado,
    fase: Fase,
    travado: bool,
    apertadas: HashSet<u32>,
    combo_segurado: bool,
    inicio: Instant,
    gravacao: Option<Gravacao>,
    captura: Option<HashSet<u32>>,
}

impl Maquina {
    fn new(app: AppHandle, cfg: ConfigDitado) -> Self {
        Maquina { app, cfg, fase: Fase::Parado, travado: false, apertadas: HashSet::new(), combo_segurado: false, inicio: Instant::now(), gravacao: None, captura: None }
    }

    fn rodar(mut self, rx: Receiver<Msg>) {
        loop {
            match rx.recv_timeout(Duration::from_secs(1)) {
                Ok(Msg::Tecla(codigo, apertada)) => self.tecla(codigo, apertada),
                Ok(Msg::Config(cfg)) => {
                    if !cfg.ativo && self.fase == Fase::Gravando {
                        self.cancelar();
                    }
                    self.cfg = cfg;
                }
                Ok(Msg::Capturar(ativo)) => self.captura = ativo.then(HashSet::new),
                Ok(Msg::Concluido) => self.fase = Fase::Parado,
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
            if self.fase == Fase::Gravando && self.inicio.elapsed() >= GRAVACAO_MAXIMA {
                self.parar();
            }
        }
    }

    fn tecla(&mut self, codigo: u32, apertada: bool) {
        if apertada {
            // Autorrepetição.
            if !self.apertadas.insert(codigo) {
                return;
            }
        } else {
            self.apertadas.remove(&codigo);
        }

        // Tela de configurações gravando um atalho novo.
        if let Some(captura) = &mut self.captura {
            if apertada {
                captura.insert(codigo);
            } else if self.apertadas.is_empty() && !captura.is_empty() {
                let atalho = teclas::ordenar_atalho(captura.drain());
                self.captura = None;
                let _ = self.app.emit("ditado-atalho-capturado", atalho);
            }
            return;
        }

        let atalho = &self.cfg.atalho;
        if !self.cfg.ativo || atalho.is_empty() {
            return;
        }
        if apertada {
            if codigo == teclas::ESC && self.fase == Fase::Gravando {
                return self.cancelar();
            }
            if !self.combo_segurado && atalho.iter().all(|t| self.apertadas.contains(t)) {
                self.combo_segurado = true;
                if self.fase == Fase::Parado {
                    self.comecar();
                } else if self.fase == Fase::Gravando && self.travado {
                    self.parar();
                }
            } else if self.combo_segurado && codigo == self.cfg.tecla_maos_livres && self.fase == Fase::Gravando && !self.travado {
                self.travado = true;
                emitir(&self.app, EstadoDitado::Gravando { travado: true, inicio: agora_ms() - self.inicio.elapsed().as_millis() as u64 });
            }
        } else if self.combo_segurado && atalho.contains(&codigo) {
            self.combo_segurado = false;
            if self.fase == Fase::Gravando && !self.travado {
                if self.inicio.elapsed() < TOQUE {
                    self.cancelar();
                } else {
                    self.parar();
                }
            }
        }
    }

    fn comecar(&mut self) {
        let app = self.app.clone();
        match gravador::iniciar(&self.cfg.microfone, move |nivel| {
            let _ = app.emit("ditado-nivel", nivel);
        }) {
            Ok(gravacao) => {
                self.gravacao = Some(gravacao);
                self.fase = Fase::Gravando;
                self.travado = false;
                self.inicio = Instant::now();
                let id = agora_ms();
                GRAVACAO_ATUAL.store(id, std::sync::atomic::Ordering::Relaxed);
                if self.cfg.pausar_midia {
                    midia(OpMidia::Pausar(id));
                }
                emitir(&self.app, EstadoDitado::Gravando { travado: false, inicio: agora_ms() });
            }
            Err(erro) => emitir(&self.app, EstadoDitado::Mensagem { texto: erro, erro: true }),
        }
    }

    fn cancelar(&mut self) {
        GRAVACAO_ATUAL.store(0, std::sync::atomic::Ordering::Relaxed);
        midia(OpMidia::Retomar);
        self.gravacao = None;
        self.fase = Fase::Parado;
        self.travado = false;
        emitir(&self.app, EstadoDitado::Oculto);
    }

    fn parar(&mut self) {
        let Some(gravacao) = self.gravacao.take() else { return self.cancelar() };
        GRAVACAO_ATUAL.store(0, std::sync::atomic::Ordering::Relaxed);
        self.fase = Fase::Processando;
        self.travado = false;
        emitir(&self.app, EstadoDitado::Processando);
        let amostras = gravacao.parar();
        // Microfone fechado: a música já não atrapalha, volta enquanto transcreve.
        midia(OpMidia::Retomar);
        let (app, cfg) = (self.app.clone(), self.cfg.clone());
        std::thread::spawn(move || {
            processar(&app, &cfg, amostras);
            enviar(Msg::Concluido);
        });
    }
}

/// Transcreve, cola e guarda no histórico. Roda fora da thread do atalho.
fn processar(app: &AppHandle, cfg: &ConfigDitado, amostras: Vec<f32>) {
    let duracao_ms = amostras.len() as u64 * 1000 / gravador::TAXA as u64;
    if duracao_ms < AUDIO_MINIMO_MS {
        return emitir(app, EstadoDitado::Oculto);
    }
    if amostras.iter().fold(0f32, |m, s| m.max(s.abs())) < 0.01 {
        return emitir(app, EstadoDitado::Mensagem { texto: "Não ouvi nada. Confira o microfone.".into(), erro: true });
    }

    let comeco = Instant::now();
    let progresso = |p: f32| emitir(app, EstadoDitado::Baixando { progresso: p });
    let resultado = tauri::async_runtime::block_on(transcrever::transcrever(app, cfg, &amostras, progresso));
    let processamento_ms = comeco.elapsed().as_millis() as u64;
    let base = |texto: String, colado: bool, erro: Option<String>| historico::Entrada {
        id: format!("{:x}", agora_ms()),
        criado_em: agora_ms(),
        palavras: historico::palavras(&texto),
        texto,
        texto_bruto: None,
        provedor: cfg.provedor.clone(),
        modelo: cfg.modelo_atual(),
        processamento_ms,
        duracao_ms,
        colado,
        erro,
    };

    match resultado {
        Ok(r) if r.texto.is_empty() => emitir(app, EstadoDitado::Mensagem { texto: "Não entendi o áudio.".into(), erro: false }),
        Ok(r) => {
            // Some antes de colar, para o foco voltar inteiro ao app de destino.
            emitir(app, EstadoDitado::Oculto);
            let colado = colar::colar(app, &r.texto, cfg.restaurar_area_transferencia);
            historico::adicionar(app, historico::Entrada { texto_bruto: r.texto_bruto, provedor: r.provedor, modelo: r.modelo, ..base(r.texto, colado, None) });
            if !colado {
                let atalho = if cfg!(target_os = "macos") { "Cmd+V" } else { "Ctrl+V" };
                emitir(app, EstadoDitado::Mensagem { texto: format!("Texto copiado. Cole com {atalho}."), erro: false });
            }
        }
        Err(erro) => {
            historico::adicionar(app, base(String::new(), false, Some(erro.clone())));
            emitir(app, EstadoDitado::Mensagem { texto: erro, erro: true });
        }
    }
}

// ---- Comandos ----------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusDitado {
    teclado: StatusTeclado,
    colagem: colar::StatusColagem,
    /// Chaves salvas: últimos 4 caracteres, ou null.
    chaves: std::collections::HashMap<String, Option<String>>,
    /// Modelos locais já baixados.
    modelos_baixados: Vec<String>,
}

#[tauri::command]
pub fn ditado_estado() -> EstadoDitado {
    ESTADO.lock().map(|e| e.clone()).unwrap_or(EstadoDitado::Oculto)
}

#[tauri::command]
pub async fn ditado_status(app: AppHandle) -> StatusDitado {
    let chaves = ["openrouter", "openai", "groq"]
        .into_iter()
        .map(|p| {
            let dica = transcrever::chave(&app, p).map(|c| c.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect());
            (p.to_string(), dica)
        })
        .collect();
    let pasta = transcrever::pasta_modelos(&app).ok();
    let modelos_baixados = transcrever::MODELOS_LOCAIS
        .iter()
        .filter(|(_, arquivo)| pasta.as_ref().is_some_and(|p| p.join(arquivo).exists()))
        .map(|(id, _)| id.to_string())
        .collect();
    StatusDitado {
        teclado: TECLADO.lock().ok().and_then(|t| t.clone()).unwrap_or_default(),
        colagem: colar::status(&app),
        chaves,
        modelos_baixados,
    }
}

#[tauri::command]
pub async fn ditado_microfones() -> Vec<String> {
    gravador::microfones()
}

#[tauri::command]
pub fn ditado_capturar_atalho(ativo: bool) {
    enviar(Msg::Capturar(ativo));
}

#[tauri::command]
pub async fn ditado_salvar_chave(app: AppHandle, provedor: String, chave: String) -> Result<(), String> {
    let id = transcrever::id_chave(&provedor);
    if chave.trim().is_empty() {
        crate::ia::cofre::remover(&app, &id)
    } else {
        crate::ia::cofre::salvar(&app, &id, chave.trim())
    }
}

#[tauri::command]
pub async fn ditado_verificar_chave(app: AppHandle, provedor: String) -> Result<String, String> {
    let chave = transcrever::chave(&app, &provedor).ok_or("Nenhuma chave salva")?;
    transcrever::verificar_chave(&provedor, &chave).await?;
    Ok("Chave válida".into())
}

#[tauri::command]
pub async fn ditado_historico(app: AppHandle) -> Vec<historico::Entrada> {
    historico::listar(&app)
}

#[tauri::command]
pub async fn ditado_apagar(app: AppHandle, id: String) -> Result<(), String> {
    historico::apagar(&app, &id)
}

#[tauri::command]
pub async fn ditado_copiar(texto: String) -> Result<(), String> {
    colar::copiar(&texto)
}
