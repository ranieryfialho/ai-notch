mod ia;
mod letras;
mod midia;
mod notch;
mod prateleira;
mod sistema;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

/// Tamanho inicial (notch recolhido); depois o front controla via `definir_tamanho_notch`.
const LARGURA_INICIAL: f64 = 230.0;
const ALTURA_INICIAL: f64 = 30.0;

pub fn run() {
    preparar_ambiente_linux();

    tauri::Builder::default()
        // Segunda instância só abre as configurações da que já está rodando.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = notch::abrir_janela_configuracoes(app, None);
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let janela = app.get_webview_window(notch::JANELA_NOTCH).expect("janela do notch no tauri.conf.json");
            notch::posicionar(&janela, LARGURA_INICIAL, ALTURA_INICIAL)?;
            #[cfg(target_os = "macos")]
            notch::elevar_acima_da_barra_de_menus(&janela);

            criar_bandeja(app.handle())?;
            sistema::monitorar_bateria(app.handle().clone());
            sistema::monitorar_caps_lock(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            notch::definir_tamanho_notch,
            notch::abrir_configuracoes,
            notch::alternar_notch,
            midia::midia_atual,
            midia::midia_comando,
            letras::buscar_letra,
            sistema::bateria_atual,
            prateleira::prateleira_info,
            prateleira::abrir_arquivo,
            prateleira::revelar_arquivo,
            prateleira::icone_arrasto,
            ia::ia_provedores,
            ia::ia_contas,
            ia::ia_salvar_conta,
            ia::ia_remover_conta,
            ia::ia_uso,
            ia::ia_testar_token,
            ia::ia_login_antigravity,
            ia::ia_antigravity_cliente,
            ia::ia_antigravity_salvar_cliente,
            ia::ia_antigravity_remover_cliente,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o AI Notch");
}

fn criar_bandeja(app: &AppHandle) -> tauri::Result<()> {
    let configuracoes = MenuItem::with_id(app, "configuracoes", "Configurações…", true, None::<&str>)?;
    let ias = MenuItem::with_id(app, "ias", "Minhas IAs…", true, None::<&str>)?;
    let alternar = MenuItem::with_id(app, "alternar", "Mostrar/ocultar notch", true, None::<&str>)?;
    let sobre = MenuItem::with_id(app, "sobre", "Sobre o AI Notch", true, None::<&str>)?;
    let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
    let separador = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&configuracoes, &ias, &alternar, &separador, &sobre, &sair])?;

    TrayIconBuilder::with_id("bandeja")
        .icon(app.default_window_icon().cloned().expect("ícone padrão"))
        .tooltip("AI Notch")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, evento| {
            let _ = match evento.id.as_ref() {
                "configuracoes" => notch::abrir_janela_configuracoes(app, None),
                "ias" => notch::abrir_janela_configuracoes(app, Some("ias".into())),
                "sobre" => notch::abrir_janela_configuracoes(app, Some("sobre".into())),
                "alternar" => notch::alternar_visibilidade(app),
                "sair" => {
                    app.exit(0);
                    Ok(())
                }
                _ => Ok(()),
            };
        })
        .on_tray_icon_event(|bandeja, evento| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                let _ = notch::abrir_janela_configuracoes(bandeja.app_handle(), None);
            }
        })
        .build(app)?;
    Ok(())
}

/// No Wayland não dá para posicionar janelas nem mantê-las sempre no topo
/// (o compositor decide), então forçamos XWayland, a não ser que o usuário
/// já tenha escolhido um backend. O DMA-BUF desligado evita tela branca do
/// WebKitGTK em drivers NVIDIA.
fn preparar_ambiente_linux() {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("GDK_BACKEND").is_none() && std::env::var_os("WAYLAND_DISPLAY").is_some() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
}
