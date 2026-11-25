//! Ícone na bandeja com o menu do app e, como o BatteryHub, a bateria dos
//! periféricos na barra. Dois jeitos, conforme o painel (`ambiente.rs`):
//! - texto ao lado do ícone (`🎧 72%  🖱 71%`): AppIndicator no GNOME, XFCE e
//!   MATE, e a barra de menus do macOS;
//! - um ícone por dispositivo com a % desenhada: Windows e KDE Plasma, que não
//!   mostram texto na bandeja. A dica do ícone traz o nome; clicar abre os ajustes.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Listener, Manager, Wry};
use tauri_plugin_store::StoreExt;

use crate::ambiente::{self, Ambiente};
use crate::icone_pct;
use crate::notch;
use crate::perifericos::{Dispositivo, Estado, Perifericos, Tipo};

const ID: &str = "bandeja";
const PREFIXO_DISPOSITIVO: &str = "periferico:";
/// Igual a `LIMITE_PADRAO` em `src/lib/config.ts`.
const LIMITE_PADRAO: u8 = 15;

/// O que a bandeja usa de `config.perifericos` (o front salva em config.json).
#[derive(Default, PartialEq)]
struct Preferencias {
    /// Mostrar os periféricos na bandeja (texto ou ícones).
    na_bandeja: bool,
    /// Nomes dados pelo usuário, por id do dispositivo.
    nomes: HashMap<String, String>,
    /// Fora da barra (continuam no menu).
    ocultos: HashSet<String>,
    limites: HashMap<String, u8>,
}

impl Preferencias {
    fn da_config(config: &serde_json::Value, ambiente: Ambiente) -> Self {
        let p = config.get("perifericos");
        let onde = p.and_then(|p| p.get("onde")).and_then(|v| v.as_str());
        // Configs antigas tinham só `barra: bool`.
        let barra_antiga = p.and_then(|p| p.get("barra")).and_then(|v| v.as_bool());
        let na_bandeja = match onde {
            Some("bandeja" | "ambos") => true,
            // Sem GNOME não há pílula: "Pílula" (config vinda de outro PC) cai na bandeja.
            Some("pilula") => !ambiente.gnome,
            Some(_) => false,
            None => barra_antiga.unwrap_or(true),
        };
        let objeto = |chave: &str| p.and_then(|p| p.get(chave)).and_then(|v| v.as_object());
        let nomes = objeto("nomes")
            .map(|m| {
                m.iter()
                    .filter_map(|(id, nome)| Some((id.clone(), nome.as_str()?.trim().to_string())))
                    .filter(|(_, nome)| !nome.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        let limites = objeto("limites")
            .map(|m| m.iter().filter_map(|(id, v)| Some((id.clone(), v.as_u64()?.min(100) as u8))).collect())
            .unwrap_or_default();
        let ocultos = p
            .and_then(|p| p.get("ocultos"))
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();
        Preferencias { na_bandeja, nomes, ocultos, limites }
    }

    fn nome<'a>(&'a self, d: &'a Dispositivo) -> &'a str {
        self.nomes.get(&d.id).map(String::as_str).unwrap_or(&d.nome)
    }

    /// Mesma regra de `corPeriferico` no front: verde carregando, vermelho no limite.
    fn cor(&self, d: &Dispositivo) -> [u8; 3] {
        let limite = self.limites.get(&d.id).copied().unwrap_or(LIMITE_PADRAO);
        if matches!(d.estado, Estado::Carregando | Estado::Cheia) {
            [74, 222, 128]
        } else if d.percentual <= limite {
            [248, 113, 113]
        } else {
            [228, 228, 231]
        }
    }
}

struct EstadoBandeja {
    ambiente: Ambiente,
    prefs: Mutex<Preferencias>,
    /// Ícones por dispositivo já criados (ids de bandeja).
    icones: Mutex<HashSet<String>>,
}

pub fn criar(app: &AppHandle) -> tauri::Result<()> {
    let ambiente = ambiente::atual();
    let config = app.store("config.json").ok().and_then(|s| s.get("config")).unwrap_or_default();
    app.manage(EstadoBandeja {
        ambiente,
        prefs: Mutex::new(Preferencias::da_config(&config, ambiente)),
        icones: Mutex::default(),
    });

    TrayIconBuilder::with_id(ID)
        .icon(app.default_window_icon().cloned().expect("ícone padrão"))
        .tooltip("AI Notch")
        .menu(&montar_menu(app, &[], &Preferencias::default())?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, evento| {
            let _ = match evento.id.as_ref() {
                "configuracoes" => notch::abrir_janela_configuracoes(app, None),
                "ias" => notch::abrir_janela_configuracoes(app, Some("ias".into())),
                "baterias" => notch::abrir_janela_configuracoes(app, Some("baterias".into())),
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

    // O front emite `config-alterada` com a config inteira a cada mudança.
    let app_ouvinte = app.clone();
    app.listen_any("config-alterada", move |evento| {
        let Ok(config) = serde_json::from_str::<serde_json::Value>(evento.payload()) else { return };
        let estado = app_ouvinte.state::<EstadoBandeja>();
        let novas = Preferencias::da_config(&config, estado.ambiente);
        let mudou = {
            let Ok(mut atuais) = estado.prefs.lock() else { return };
            let mudou = *atuais != novas;
            *atuais = novas;
            mudou
        };
        if mudou {
            let lista = app_ouvinte.try_state::<Perifericos>().and_then(|p| p.0.lock().ok().map(|l| l.clone())).unwrap_or_default();
            mostrar_perifericos(&app_ouvinte, &lista);
        }
    });
    Ok(())
}

/// Redesenha rótulo (ou ícones), dica e menu com a lista atual de periféricos.
pub fn mostrar_perifericos(app: &AppHandle, lista: &[Dispositivo]) {
    let Some(bandeja) = app.tray_by_id(ID) else { return };
    let estado = app.state::<EstadoBandeja>();
    let Ok(prefs) = estado.prefs.lock() else { return };
    let visiveis: Vec<&Dispositivo> = if prefs.na_bandeja { lista.iter().filter(|d| !prefs.ocultos.contains(&d.id)).collect() } else { Vec::new() };

    if estado.ambiente.rotulo_na_bandeja {
        let rotulo = visiveis.iter().map(|d| resumo_curto(d)).collect::<Vec<_>>().join("  ");
        let _ = bandeja.set_title(if rotulo.is_empty() { None } else { Some(rotulo.as_str()) });
    } else {
        atualizar_icones(app, &estado, &visiveis, &prefs);
    }

    let dica = std::iter::once("AI Notch".to_string()).chain(lista.iter().map(|d| resumo_longo(d, prefs.nome(d)))).collect::<Vec<_>>().join("\n");
    let _ = bandeja.set_tooltip(Some(dica));

    if let Ok(menu) = montar_menu(app, lista, &prefs) {
        let _ = bandeja.set_menu(Some(menu));
    }
}

/// Um ícone por periférico visível; some o de quem saiu (ou foi ocultado).
fn atualizar_icones(app: &AppHandle, estado: &EstadoBandeja, visiveis: &[&Dispositivo], prefs: &Preferencias) {
    let Ok(mut criados) = estado.icones.lock() else { return };
    let desejados: HashSet<String> = visiveis.iter().map(|d| format!("{PREFIXO_DISPOSITIVO}{}", d.id)).collect();

    for id in criados.difference(&desejados).cloned().collect::<Vec<_>>() {
        let _ = app.remove_tray_by_id(id.as_str());
        criados.remove(&id);
    }

    for d in visiveis {
        let id = format!("{PREFIXO_DISPOSITIVO}{}", d.id);
        let imagem = icone_pct::desenhar(d.percentual, prefs.cor(d));
        let dica = resumo_longo(d, prefs.nome(d));
        if let Some(icone) = app.tray_by_id(id.as_str()) {
            let _ = icone.set_icon(Some(imagem));
            let _ = icone.set_tooltip(Some(dica));
            continue;
        }
        let criado = TrayIconBuilder::with_id(id.as_str())
            .icon(imagem)
            .tooltip(dica)
            .on_tray_icon_event(|icone, evento| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                    let _ = notch::abrir_janela_configuracoes(icone.app_handle(), Some("baterias".into()));
                }
            })
            .build(app);
        if criado.is_ok() {
            criados.insert(id);
        }
    }
}

fn montar_menu(app: &AppHandle, lista: &[Dispositivo], prefs: &Preferencias) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    if !lista.is_empty() {
        for (i, d) in lista.iter().enumerate() {
            menu.append(&MenuItem::with_id(app, format!("dispositivo-{i}"), resumo_longo(d, prefs.nome(d)), false, None::<&str>)?)?;
        }
        menu.append(&MenuItem::with_id(app, "baterias", "Ajustes das baterias…", true, None::<&str>)?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    menu.append(&MenuItem::with_id(app, "configuracoes", "Configurações…", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "ias", "Minhas IAs…", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "alternar", "Mostrar/ocultar notch", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "sobre", "Sobre o AI Notch", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?)?;
    Ok(menu)
}

/// `🖱 71%`, com ⚡ carregando.
fn resumo_curto(d: &Dispositivo) -> String {
    let raio = if d.estado == Estado::Carregando { "⚡" } else { "" };
    format!("{} {}%{raio}", icone(d.tipo), d.percentual)
}

/// `🖱 MX Master 3 · 71% · carregando`
fn resumo_longo(d: &Dispositivo, nome: &str) -> String {
    let estado = match d.estado {
        Estado::Carregando => " · carregando",
        Estado::Cheia => " · carregado",
        _ => "",
    };
    format!("{} {nome} · {}%{estado}", icone(d.tipo), d.percentual)
}

fn icone(tipo: Tipo) -> &'static str {
    match tipo {
        Tipo::Headset | Tipo::Fones => "🎧",
        Tipo::Mouse => "🖱",
        Tipo::Teclado => "⌨",
        Tipo::Controle => "🎮",
        Tipo::Caneta => "🖊",
        Tipo::Outro => "🔋",
    }
}
