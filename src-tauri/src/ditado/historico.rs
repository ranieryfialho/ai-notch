//! Últimos ditados (texto, provedor, tempos), em `ditado/historico.json` na
//! pasta de dados do app. Guarda os 100 mais recentes; o áudio não fica salvo.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

const LIMITE: usize = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entrada {
    pub id: String,
    /// Epoch em ms.
    pub criado_em: u64,
    pub texto: String,
    /// Antes da limpeza com IA, quando houve limpeza.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub texto_bruto: Option<String>,
    pub provedor: String,
    pub modelo: String,
    pub processamento_ms: u64,
    pub duracao_ms: u64,
    pub palavras: usize,
    pub colado: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub erro: Option<String>,
}

/// Leitura e escrita do arquivo uma de cada vez.
static TRAVA: Mutex<()> = Mutex::new(());

fn arquivo(app: &AppHandle) -> Result<PathBuf, String> {
    let pasta = app.path().app_data_dir().map_err(|e| e.to_string())?.join("ditado");
    std::fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    Ok(pasta.join("historico.json"))
}

fn ler_sem_trava(app: &AppHandle) -> Vec<Entrada> {
    arquivo(app).ok().and_then(|p| std::fs::read_to_string(p).ok()).and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn gravar_sem_trava(app: &AppHandle, lista: &[Entrada]) -> Result<(), String> {
    let caminho = arquivo(app)?;
    let temporario = caminho.with_extension("tmp");
    std::fs::write(&temporario, serde_json::to_string(lista).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(temporario, caminho).map_err(|e| e.to_string())?;
    let _ = app.emit("ditado-historico", ());
    Ok(())
}

pub fn listar(app: &AppHandle) -> Vec<Entrada> {
    let _trava = TRAVA.lock();
    ler_sem_trava(app)
}

pub fn adicionar(app: &AppHandle, entrada: Entrada) {
    let _trava = TRAVA.lock();
    let mut lista = ler_sem_trava(app);
    lista.insert(0, entrada);
    lista.truncate(LIMITE);
    let _ = gravar_sem_trava(app, &lista);
}

pub fn apagar(app: &AppHandle, id: &str) -> Result<(), String> {
    let _trava = TRAVA.lock();
    let mut lista = ler_sem_trava(app);
    lista.retain(|e| e.id != id);
    gravar_sem_trava(app, &lista)
}

pub fn palavras(texto: &str) -> usize {
    texto.split_whitespace().count()
}
