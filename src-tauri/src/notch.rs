use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const JANELA_NOTCH: &str = "notch";
pub const JANELA_CONFIG: &str = "configuracoes";

/// Borda da tela onde o notch fica (escolhida em Configurações → Geral).
#[derive(Clone, Copy, Default, PartialEq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Posicao {
    #[default]
    Topo,
    Base,
    Esquerda,
    Direita,
}

impl Posicao {
    fn vertical(self) -> bool {
        matches!(self, Posicao::Esquerda | Posicao::Direita)
    }
}

/// Maior desenho do notch com as orelhas e a folga, em pixels lógicos: aberto
/// deitado (topo/base) ou aberto/recolhido em pé (laterais). Precisa
/// acompanhar `TAMANHO` e `ORELHA` em `Notch.tsx`. A altura deitada é 200 e
/// não 172 + folga porque o GTK não deixa esta janela ficar mais baixa que
/// isso; pedindo menos, ela cresceria por conta própria e, na base, o notch
/// sairia da tela.
#[cfg(target_os = "linux")]
const AREA_HORIZONTAL: (f64, f64) = (560.0, 200.0);
#[cfg(target_os = "linux")]
const AREA_VERTICAL: (f64, f64) = (540.0 + FOLGA, 230.0);

/// Faixa clicável (e invisível) do lado de dentro do notch, oposto à borda.
/// Ao sair por um lado colado na região de clique, o WebKitGTK recebe o último
/// ponto ainda dentro do desenho e nunca dispara `mouseleave`, então o notch
/// não fechava. Nas pontas as orelhas já fazem esse papel.
#[cfg(target_os = "linux")]
const FOLGA: f64 = 8.0;

/// Último tamanho de janela pedido, para não reconfigurar à toa.
#[cfg(target_os = "linux")]
static AREA_ATUAL: std::sync::Mutex<Option<(Posicao, f64, f64)>> = std::sync::Mutex::new(None);

/// No X11 redimensionar e mover a janela são dois "configure" separados e o
/// WebKitGTK redesenha atrasado: a cada transição o notch tremia, pulava para
/// o lado e mostrava quadros cortados. Por isso no Linux a janela fica parada
/// no tamanho máximo e só a região que aceita cliques acompanha o desenho;
/// o resto continua deixando os cliques passarem para o que está atrás.
#[cfg(target_os = "linux")]
pub fn posicionar(janela: &WebviewWindow, largura: f64, altura: f64, posicao: Posicao) -> tauri::Result<()> {
    use gtk::prelude::*;

    let (folga_l, folga_a) = if posicao.vertical() { (FOLGA, 0.0) } else { (0.0, FOLGA) };
    let (l, a) = (largura + folga_l, altura + folga_a);
    let maximo = if posicao.vertical() { AREA_VERTICAL } else { AREA_HORIZONTAL };
    let (area_l, area_a) = (maximo.0.max(l).round(), maximo.1.max(a).round());
    {
        // Também confere o tamanho real: logo na abertura o GTK pode ignorar o
        // pedido (janela ainda não mapeada) e o notch ficaria fora do centro.
        let real = janela.inner_size()?.to_logical::<f64>(janela.scale_factor()?);
        let tamanho_errado = (real.width - area_l).abs() > 1.0 || (real.height - area_a).abs() > 1.0;
        let mut atual = AREA_ATUAL.lock().unwrap_or_else(|e| e.into_inner());
        if tamanho_errado || *atual != Some((posicao, area_l, area_a)) {
            posicionar_janela(janela, area_l, area_a, posicao)?;
            *atual = Some((posicao, area_l, area_a));
        }
    }

    // O desenho é alinhado pelo CSS (colado na borda, centralizado ao longo
    // dela); a região de clique segue o mesmo lugar, com a folga para dentro.
    let x = match posicao {
        Posicao::Topo | Posicao::Base => (area_l - largura) / 2.0,
        Posicao::Esquerda => 0.0,
        Posicao::Direita => area_l - l,
    };
    let y = match posicao {
        Posicao::Topo => 0.0,
        Posicao::Base => area_a - a,
        Posicao::Esquerda | Posicao::Direita => (area_a - altura) / 2.0,
    };
    let regiao = gtk::cairo::RectangleInt::new(x.round() as i32, y.round() as i32, l.round() as i32, a.round() as i32);
    let j = janela.clone();
    janela.run_on_main_thread(move || {
        let Ok(gtk) = j.gtk_window() else { return };
        gtk.input_shape_combine_region(Some(&gtk::cairo::Region::create_rectangle(&regiao)));
    })
}

/// Rede de segurança para o `mouseleave`: o GTK sabe com certeza quando o
/// cursor saiu da região de clique, mesmo quando o WebKitGTK não percebe
/// (saída rápida ou pela borda colada na barra do topo).
#[cfg(target_os = "linux")]
pub fn avisar_saida_do_mouse(janela: &WebviewWindow) -> tauri::Result<()> {
    use gtk::prelude::*;
    use tauri::Emitter;

    let gtk = janela.gtk_window()?;
    gtk.add_events(gtk::gdk::EventMask::LEAVE_NOTIFY_MASK);
    let j = janela.clone();
    gtk.connect_leave_notify_event(move |_, evento| {
        // Inferior = o cursor só passou para um widget filho (o WebView).
        if evento.detail() != gtk::gdk::NotifyType::Inferior {
            let _ = j.emit("mouse-saiu", ());
        }
        gtk::glib::Propagation::Proceed
    });
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn posicionar(janela: &WebviewWindow, largura: f64, altura: f64, posicao: Posicao) -> tauri::Result<()> {
    posicionar_janela(janela, largura, altura, posicao)
}

/// Redimensiona o notch e o cola na borda escolhida do monitor principal,
/// centralizado ao longo dela. Os tamanhos chegam em pixels lógicos (CSS) e
/// são convertidos pela escala do monitor, senão o notch fica pequeno em telas HiDPI.
fn posicionar_janela(janela: &WebviewWindow, largura: f64, altura: f64, posicao: Posicao) -> tauri::Result<()> {
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
    // Fora do topo, o notch respeita a barra de tarefas/dock: fica na área útil.
    let util = monitor.work_area();
    let (util_x, util_y) = (util.position.x, util.position.y);
    let (util_l, util_a) = (util.size.width as i32, util.size.height as i32);

    // No Linux a barra do topo (GNOME, KDE...) fica por cima de qualquer
    // janela: o notch encosta embaixo dela, em vez de depender do gerenciador
    // de janelas empurrá-lo (alguns não empurram e ele some atrás da barra).
    #[cfg(target_os = "linux")]
    let topo = util_y;
    #[cfg(not(target_os = "linux"))]
    let topo = origem.y;

    let centro_x = origem.x + (tela.width as i32 - largura_px) / 2;
    let centro_y = util_y + (util_a - altura_px) / 2;
    let (x, y) = match posicao {
        Posicao::Topo => (centro_x, topo),
        Posicao::Base => (centro_x, util_y + util_a - altura_px),
        Posicao::Esquerda => (util_x, centro_y),
        Posicao::Direita => (util_x + util_l - largura_px, centro_y),
    };

    janela.set_size(PhysicalSize::new(largura_px.max(1) as u32, altura_px.max(1) as u32))?;
    janela.set_position(PhysicalPosition::new(x, y))?;
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
pub async fn definir_tamanho_notch(janela: WebviewWindow, largura: f64, altura: f64, posicao: Posicao) -> Result<(), String> {
    posicionar(&janela, largura, altura, posicao).map_err(|e| e.to_string())
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

