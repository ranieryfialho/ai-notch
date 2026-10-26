use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const JANELA_NOTCH: &str = "notch";
pub const JANELA_CONFIG: &str = "configuracoes";

/// Redimensiona o notch mantendo-o centralizado e colado na borda superior do
/// monitor principal. Os tamanhos chegam em pixels lógicos (CSS) e são
/// convertidos pela escala do monitor, senão o notch fica pequeno em telas HiDPI.
pub fn posicionar(janela: &WebviewWindow, largura: f64, altura: f64) -> tauri::Result<()> {
    let monitor = match janela.primary_monitor()? {
        Some(m) => m,
        None => match janela.current_monitor()? {
            Some(m) => m,
            None => return Ok(()),
        },
    };
    let escala = monitor.scale_factor();
    let largura_px = (largura * escala).round() as i32;
    let altura_px = (altura * escala).round() as i32;
    let origem = monitor.position();
    let tela = monitor.size();

    janela.set_size(PhysicalSize::new(largura_px.max(1) as u32, altura_px.max(1) as u32))?;
    janela.set_position(PhysicalPosition::new(
        origem.x + (tela.width as i32 - largura_px) / 2,
        origem.y,
    ))?;
    Ok(())
}

/// No macOS o nível "always on top" do Tauri (NSFloatingWindowLevel) fica
/// abaixo da barra de menus, então o notch sumiria atrás dela. Subimos para
/// acima de NSMainMenuWindowLevel (24) para cobrir o notch físico.
#[cfg(target_os = "macos")]
pub fn elevar_acima_da_barra_de_menus(janela: &WebviewWindow) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    let Ok(ptr) = janela.ns_window() else { return };
    if ptr.is_null() {
        return;
    }
    // NSWindowCollectionBehaviorCanJoinAllSpaces (1) | Stationary (16) | FullScreenAuxiliary (256)
    let comportamento: usize = 1 | 16 | 256;
    unsafe {
        let ns_window = &*(ptr as *const AnyObject);
        let _: () = msg_send![ns_window, setLevel: 25isize];
        let _: () = msg_send![ns_window, setCollectionBehavior: comportamento];
    }
}

// Todos os comandos são `async`: comando síncrono roda na thread principal e,
// no Windows, criar/redimensionar janela de dentro dele trava o WebView2
// (a janela de configurações abria em branco e o notch parava de encolher).
#[tauri::command]
pub async fn definir_tamanho_notch(janela: WebviewWindow, largura: f64, altura: f64) -> Result<(), String> {
    posicionar(&janela, largura, altura).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn abrir_configuracoes(app: AppHandle, secao: Option<String>) -> Result<(), String> {
    abrir_janela_configuracoes(&app, secao).map_err(|e| e.to_string())
}

pub fn abrir_janela_configuracoes(app: &AppHandle, secao: Option<String>) -> tauri::Result<()> {
    use tauri::Emitter;

    if let Some(janela) = app.get_webview_window(JANELA_CONFIG) {
        janela.unminimize()?;
        janela.show()?;
        janela.set_focus()?;
        if let Some(secao) = secao {
            janela.emit("ir-para-secao", secao)?;
        }
        return Ok(());
    }

    let url = match secao {
        Some(s) => format!("index.html#{s}"),
        None => "index.html".into(),
    };
    WebviewWindowBuilder::new(app, JANELA_CONFIG, WebviewUrl::App(url.into()))
        .title("Configurações — AI Notch")
        .inner_size(760.0, 620.0)
        .min_inner_size(640.0, 480.0)
        .center()
        .focused(true)
        .build()?
        .set_focus()?;
    Ok(())
}

#[tauri::command]
pub async fn alternar_notch(app: AppHandle) -> Result<(), String> {
    alternar_visibilidade(&app).map_err(|e| e.to_string())
}

pub fn alternar_visibilidade(app: &AppHandle) -> tauri::Result<()> {
    if let Some(janela) = app.get_webview_window(JANELA_NOTCH) {
        if janela.is_visible()? {
            janela.hide()?;
        } else {
            janela.show()?;
        }
    }
    Ok(())
}
