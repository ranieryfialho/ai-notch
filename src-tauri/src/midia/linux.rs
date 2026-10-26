use base64::{engine::general_purpose::STANDARD, Engine};
use mpris::{PlaybackStatus, PlayerFinder};

use super::{Acao, Midia};

pub fn agora() -> Result<Option<Midia>, String> {
    let buscador = PlayerFinder::new().map_err(|e| e.to_string())?;
    let Ok(player) = buscador.find_active() else {
        return Ok(None);
    };
    let meta = player.get_metadata().map_err(|e| e.to_string())?;

    let titulo = meta.title().unwrap_or_default().to_string();
    if titulo.is_empty() {
        return Ok(None);
    }

    Ok(Some(Midia {
        titulo,
        artista: meta.artists().map(|a| a.join(", ")).unwrap_or_default(),
        album: meta.album_name().unwrap_or_default().to_string(),
        duracao_ms: meta.length().map(|d| d.as_millis() as u64).unwrap_or(0),
        posicao_ms: player.get_position().map(|d| d.as_millis() as u64).unwrap_or(0),
        tocando: matches!(player.get_playback_status(), Ok(PlaybackStatus::Playing)),
        capa: meta.art_url().and_then(capa_de_url),
        fonte: player.identity().to_string(),
    }))
}

/// Players locais (Rhythmbox, VLC) apontam a capa para um file://, que a
/// webview não pode carregar; esses viram data: URL. http(s) passa direto.
fn capa_de_url(url: &str) -> Option<String> {
    if url.starts_with("http://") || url.starts_with("https://") {
        return Some(url.to_string());
    }
    let caminho = url::Url::parse(url).ok()?.to_file_path().ok()?;
    let bytes = std::fs::read(&caminho).ok()?;
    let tipo = match caminho.extension().and_then(|e| e.to_str()) {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        _ => "image/png",
    };
    Some(format!("data:{tipo};base64,{}", STANDARD.encode(bytes)))
}

pub fn comando(acao: Acao) -> Result<(), String> {
    let buscador = PlayerFinder::new().map_err(|e| e.to_string())?;
    let player = buscador.find_active().map_err(|e| e.to_string())?;
    match acao {
        Acao::TocarPausar => player.play_pause(),
        Acao::Proxima => player.next(),
        Acao::Anterior => player.previous(),
    }
    .map_err(|e| e.to_string())
}
