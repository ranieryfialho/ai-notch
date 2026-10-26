//! "O que está tocando" e controles de mídia. Cada sistema tem uma API
//! própria, então a interface comum é só esta struct + três ações:
//! - Windows: GlobalSystemMediaTransportControls (qualquer app que publique mídia)
//! - Linux: MPRIS via D-Bus (Spotify, navegadores, VLC, Rhythmbox...)
//! - macOS: AppleScript para Spotify e Música (o MediaRemote é privado)

use serde::Serialize;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod win;

#[cfg(target_os = "linux")]
use linux as plataforma;
#[cfg(target_os = "macos")]
use macos as plataforma;
#[cfg(windows)]
use win as plataforma;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Midia {
    pub titulo: String,
    pub artista: String,
    pub album: String,
    pub duracao_ms: u64,
    pub posicao_ms: u64,
    pub tocando: bool,
    /// data: URL ou URL http(s) da capa, quando o player expõe.
    pub capa: Option<String>,
    pub fonte: String,
}

#[derive(Debug, Clone, Copy)]
pub enum Acao {
    TocarPausar,
    Proxima,
    Anterior,
}

#[tauri::command]
pub async fn midia_atual() -> Result<Option<Midia>, String> {
    // As APIs de mídia são bloqueantes (WinRT .get(), D-Bus, osascript);
    // fora da thread principal para não travar a janela.
    tauri::async_runtime::spawn_blocking(plataforma::agora)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn midia_comando(acao: String) -> Result<(), String> {
    let acao = match acao.as_str() {
        "tocar-pausar" => Acao::TocarPausar,
        "proxima" => Acao::Proxima,
        "anterior" => Acao::Anterior,
        outra => return Err(format!("Ação de mídia desconhecida: {outra}")),
    };
    tauri::async_runtime::spawn_blocking(move || plataforma::comando(acao))
        .await
        .map_err(|e| e.to_string())?
}
