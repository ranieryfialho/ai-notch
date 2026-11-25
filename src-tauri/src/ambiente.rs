//! Em que sistema e painel o app está, para a bandeja e as configurações se
//! adaptarem ao que cada um consegue mostrar.

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ambiente {
    /// "linux", "windows" ou "macos".
    pub so: &'static str,
    /// GNOME: a pílula no painel (extensão) é possível.
    pub gnome: bool,
    /// O painel mostra texto ao lado do ícone da bandeja (AppIndicator no
    /// GNOME/XFCE/MATE, barra de menus no macOS). Onde não mostra (Windows,
    /// KDE Plasma), cada periférico ganha um ícone próprio com a % desenhada.
    pub rotulo_na_bandeja: bool,
}

pub fn atual() -> Ambiente {
    let so = if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    // XDG_CURRENT_DESKTOP pode ter vários nomes: "ubuntu:GNOME", "KDE"...
    let paineis: Vec<String> = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().split(':').map(|p| p.trim().to_lowercase()).collect();
    let tem = |nome: &str| paineis.iter().any(|p| p == nome);
    Ambiente {
        so,
        gnome: so == "linux" && tem("gnome"),
        rotulo_na_bandeja: match so {
            "macos" => true,
            "linux" => !tem("kde"),
            _ => false,
        },
    }
}

#[tauri::command]
pub fn ambiente() -> Ambiente {
    atual()
}
