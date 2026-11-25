mod ambiente;
mod bandeja;
mod barra;
mod ditado;
mod ia;
mod icone_pct;
mod letras;
mod midia;
mod notch;
mod perifericos;
mod prateleira;
mod sistema;

use tauri::Manager;

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
            notch::posicionar(&janela, LARGURA_INICIAL, ALTURA_INICIAL, notch::Posicao::Topo)?;
            #[cfg(target_os = "linux")]
            notch::avisar_saida_do_mouse(&janela)?;
            #[cfg(target_os = "macos")]
            notch::elevar_acima_da_barra_de_menus(&janela);

            bandeja::criar(app.handle())?;
            perifericos::monitorar(app.handle().clone());
            barra::iniciar(app.handle().clone());
            ditado::iniciar(app.handle().clone());
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
            perifericos::perifericos_atuais,
            barra::publicar_barra,
            barra::modo_barra,
            barra::instalar_extensao_gnome,
            ambiente::ambiente,
            ditado::ditado_estado,
            ditado::ditado_status,
            ditado::ditado_microfones,
            ditado::ditado_capturar_atalho,
            ditado::ditado_salvar_chave,
            ditado::ditado_verificar_chave,
            ditado::ditado_historico,
            ditado::ditado_apagar,
            ditado::ditado_copiar,
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

/// No Wayland não dá para posicionar janelas nem mantê-las sempre no topo
/// (o compositor decide), então forçamos XWayland, a não ser que o usuário
/// já tenha escolhido um backend. O DMA-BUF desligado evita tela branca do
/// WebKitGTK em drivers NVIDIA, mas com Mesa (Intel/AMD, inclusive notebooks
/// híbridos) ele quebra a composição: só os elementos animados apareciam.
fn preparar_ambiente_linux() {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("GDK_BACKEND").is_none() && std::env::var_os("WAYLAND_DISPLAY").is_some() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() && so_gpu_nvidia() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
}

/// Todas as GPUs em /sys/class/drm são NVIDIA (fabricante 0x10de)? Em
/// notebooks híbridos a Intel/AMD desenha a tela, e aí o DMA-BUF funciona.
#[cfg(target_os = "linux")]
fn so_gpu_nvidia() -> bool {
    let Ok(placas) = std::fs::read_dir("/sys/class/drm") else { return false };
    let fabricantes: Vec<String> = placas
        .flatten()
        .filter(|p| {
            let nome = p.file_name();
            let nome = nome.to_string_lossy();
            nome.starts_with("card") && !nome.contains('-')
        })
        .filter_map(|p| std::fs::read_to_string(p.path().join("device/vendor")).ok())
        .map(|v| v.trim().to_lowercase())
        .collect();
    !fabricantes.is_empty() && fabricantes.iter().all(|v| v == "0x10de")
}
