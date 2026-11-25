//! Integração com a barra do sistema. No GNOME, a extensão em
//! `extras/gnome-shell-extension/` desenha uma "pílula" no lugar do relógio do
//! painel e conversa com o app pelo D-Bus da sessão:
//! - o front publica um resumo (JSON) do que o notch recolhido mostraria
//!   (música, bateria, pomodoro, IA, aviso) e a extensão desenha isso no painel;
//! - no hover da pílula a extensão chama `Abrir` e o notch completo desce logo
//!   abaixo do painel; ao clicar (calendário do GNOME) ela chama `Fechar`.
//!
//! Enquanto a extensão está conectada o app fica no "modo barra": o notch
//! recolhido some, porque a pílula ocupa o lugar dele. Se o GNOME Shell cair
//! sem avisar, o app percebe pelo D-Bus e volta ao notch flutuante.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter};

static RESUMO: Mutex<String> = Mutex::new(String::new());
static MODO_BARRA: AtomicBool = AtomicBool::new(false);

/// O front manda o resumo sempre que ele muda (não a cada quadro).
#[tauri::command]
pub async fn publicar_barra(resumo: String) {
    if let Ok(mut atual) = RESUMO.lock() {
        if *atual == resumo {
            return;
        }
        atual.clone_from(&resumo);
    }
    #[cfg(target_os = "linux")]
    linux::emitir_estado(&resumo).await;
}

#[tauri::command]
pub fn modo_barra() -> bool {
    MODO_BARRA.load(Ordering::Relaxed)
}

// Só o serviço D-Bus do Linux liga e desliga o modo barra.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn definir_modo(app: &AppHandle, ligado: bool) {
    if MODO_BARRA.swap(ligado, Ordering::Relaxed) != ligado {
        let _ = app.emit("modo-barra", ligado);
    }
}

/// Instala (ou atualiza) a extensão do GNOME para o usuário e tenta ativá-la.
/// Os arquivos vão embutidos no app, então funciona igual no AppImage e no .deb.
#[tauri::command]
pub async fn instalar_extensao_gnome() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    return linux::instalar_extensao();
    #[cfg(not(target_os = "linux"))]
    Err("A extensão da barra só existe para o GNOME (Linux).".into())
}

pub fn iniciar(app: AppHandle) {
    #[cfg(target_os = "linux")]
    tauri::async_runtime::spawn(async move {
        if let Err(e) = linux::servir(app).await {
            eprintln!("barra: serviço D-Bus indisponível ({e})");
        }
    });
    #[cfg(not(target_os = "linux"))]
    let _ = app;
}

#[cfg(target_os = "linux")]
mod linux {
    use std::sync::{Mutex, OnceLock};

    use futures_util::StreamExt;
    use tauri::{AppHandle, Emitter};
    use zbus::message::Header;
    use zbus::names::UniqueName;
    use zbus::object_server::SignalEmitter;
    use zbus::{connection, fdo, interface, Connection};

    use super::{definir_modo, RESUMO};

    const NOME: &str = "io.github.ranieryfialho.AiNotch";
    const CAMINHO: &str = "/io/github/ranieryfialho/AiNotch";

    static CONEXAO: OnceLock<Connection> = OnceLock::new();
    /// Nome único (:1.x) do GNOME Shell que se conectou, para não vigiar duas vezes.
    static VIGIADO: Mutex<Option<String>> = Mutex::new(None);

    struct Barra {
        app: AppHandle,
    }

    #[interface(name = "io.github.ranieryfialho.AiNotch.Barra")]
    impl Barra {
        /// Resumo atual em JSON (a extensão pede ao conectar).
        fn estado(&self) -> String {
            RESUMO.lock().map(|r| r.clone()).unwrap_or_default()
        }

        /// A extensão assumiu o painel: o notch recolhido sai de cena.
        async fn conectar(&self, #[zbus(header)] cabecalho: Header<'_>, #[zbus(connection)] conexao: &Connection) {
            definir_modo(&self.app, true);
            let Some(remetente) = cabecalho.sender().map(|s| s.to_owned()) else { return };
            {
                let Ok(mut vigiado) = VIGIADO.lock() else { return };
                if vigiado.as_deref() == Some(remetente.as_str()) {
                    return;
                }
                *vigiado = Some(remetente.to_string());
            }
            tauri::async_runtime::spawn(vigiar(conexao.clone(), remetente, self.app.clone()));
        }

        /// Extensão desativada: o notch flutuante volta.
        fn desconectar(&self) {
            definir_modo(&self.app, false);
        }

        fn abrir(&self) {
            let _ = self.app.emit("barra-abrir", ());
        }

        fn fechar(&self) {
            let _ = self.app.emit("barra-fechar", ());
        }

        #[zbus(signal)]
        async fn estado_mudou(emissor: &SignalEmitter<'_>, estado: &str) -> zbus::Result<()>;
    }

    pub async fn servir(app: AppHandle) -> zbus::Result<()> {
        let conexao = connection::Builder::session()?.name(NOME)?.serve_at(CAMINHO, Barra { app })?.build().await?;
        let _ = CONEXAO.set(conexao);
        Ok(())
    }

    const UUID: &str = "ai-notch@ranieryfialho.github.io";
    const ARQUIVOS: [(&str, &str); 3] = [
        ("metadata.json", include_str!("../../extras/gnome-shell-extension/ai-notch@ranieryfialho.github.io/metadata.json")),
        ("extension.js", include_str!("../../extras/gnome-shell-extension/ai-notch@ranieryfialho.github.io/extension.js")),
        ("stylesheet.css", include_str!("../../extras/gnome-shell-extension/ai-notch@ranieryfialho.github.io/stylesheet.css")),
    ];

    pub fn instalar_extensao() -> Result<String, String> {
        let dados = std::env::var_os("XDG_DATA_HOME")
            .map(std::path::PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".local/share")))
            .ok_or("Não achei a pasta do usuário (HOME).")?;
        let destino = dados.join("gnome-shell/extensions").join(UUID);
        std::fs::create_dir_all(&destino).map_err(|e| format!("Não consegui criar {}: {e}", destino.display()))?;
        for (nome, conteudo) in ARQUIVOS {
            std::fs::write(destino.join(nome), conteudo).map_err(|e| format!("Não consegui gravar {nome}: {e}"))?;
        }
        let ativou = std::process::Command::new("gnome-extensions")
            .args(["enable", UUID])
            .output()
            .is_ok_and(|saida| saida.status.success());
        Ok(if ativou {
            "Extensão instalada e ativada. Se a pílula não aparecer, saia e entre de novo na sessão.".into()
        } else {
            "Extensão instalada. Saia e entre de novo na sessão para o GNOME carregá-la; depois ela é ativada aqui mesmo.".into()
        })
    }

    pub async fn emitir_estado(resumo: &str) {
        let Some(conexao) = CONEXAO.get() else { return };
        if let Ok(emissor) = SignalEmitter::new(conexao, CAMINHO) {
            let _ = Barra::estado_mudou(&emissor, resumo).await;
        }
    }

    /// Se o GNOME Shell que se conectou sumir do barramento (travou, reiniciou),
    /// voltamos ao notch flutuante em vez de ficar sem notch nenhum.
    async fn vigiar(conexao: Connection, remetente: UniqueName<'static>, app: AppHandle) {
        let Ok(dbus) = fdo::DBusProxy::new(&conexao).await else { return };
        let Ok(mut mudancas) = dbus.receive_name_owner_changed_with_args(&[(0, remetente.as_str())]).await else { return };
        while let Some(sinal) = mudancas.next().await {
            if sinal.args().is_ok_and(|a| a.new_owner().is_none()) {
                break;
            }
        }
        if let Ok(mut vigiado) = VIGIADO.lock() {
            if vigiado.as_deref() == Some(remetente.as_str()) {
                *vigiado = None;
                definir_modo(&app, false);
            }
        }
    }
}
