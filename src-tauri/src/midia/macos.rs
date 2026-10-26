use std::process::Command;

use super::{Acao, Midia};

/// Apps consultados em ordem. O `if application ... is running` evita que o
/// AppleScript abra o player só para perguntar o que está tocando.
const PLAYERS: [&str; 2] = ["Spotify", "Music"];

const SEPARADOR: &str = "␟";

fn script_consulta(app: &str) -> String {
    // Spotify devolve a duração em ms; o Música em segundos (real).
    let duracao = if app == "Spotify" { "(duration of current track)" } else { "((duration of current track) * 1000)" };
    let capa = if app == "Spotify" { "(artwork url of current track)" } else { "\"\"" };
    format!(
        r#"if application "{app}" is running then
  tell application "{app}"
    if player state is stopped then return ""
    return (player state as string) & "{s}" & (name of current track) & "{s}" & (artist of current track) & "{s}" & (album of current track) & "{s}" & ({duracao} as integer) & "{s}" & ((player position * 1000) as integer) & "{s}" & {capa}
  end tell
end if
return """#,
        s = SEPARADOR
    )
}

fn osascript(script: &str) -> Option<String> {
    let saida = Command::new("osascript").arg("-e").arg(script).output().ok()?;
    if !saida.status.success() {
        return None;
    }
    let texto = String::from_utf8_lossy(&saida.stdout).trim().to_string();
    (!texto.is_empty()).then_some(texto)
}

fn consultar(app: &str) -> Option<Midia> {
    let texto = osascript(&script_consulta(app))?;
    let partes: Vec<&str> = texto.split(SEPARADOR).collect();
    if partes.len() < 7 || partes[1].is_empty() {
        return None;
    }
    Some(Midia {
        tocando: partes[0] == "playing",
        titulo: partes[1].into(),
        artista: partes[2].into(),
        album: partes[3].into(),
        duracao_ms: partes[4].parse().unwrap_or(0),
        posicao_ms: partes[5].parse().unwrap_or(0),
        capa: (!partes[6].is_empty()).then(|| partes[6].to_string()),
        fonte: app.into(),
    })
}

pub fn agora() -> Result<Option<Midia>, String> {
    // Prioriza o player que está tocando; se nenhum estiver, mostra o pausado.
    let encontrados: Vec<Midia> = PLAYERS.iter().filter_map(|app| consultar(app)).collect();
    Ok(encontrados.iter().find(|m| m.tocando).or(encontrados.first()).cloned())
}

pub fn comando(acao: Acao) -> Result<(), String> {
    let verbo = match acao {
        Acao::TocarPausar => "playpause",
        Acao::Proxima => "next track",
        Acao::Anterior => "previous track",
    };
    let alvo = agora()?.map(|m| m.fonte).ok_or("Nenhum player aberto")?;
    osascript(&format!(r#"tell application "{alvo}" to {verbo}"#));
    Ok(())
}
