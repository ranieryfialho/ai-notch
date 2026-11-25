//! Bateria dos periféricos sem fio (mouse, teclado, headset, controle...),
//! no espírito do BatteryHub. Cada sistema tem a sua fonte:
//! - Linux: UPower via D-Bus. O kernel já lê Logitech (Unifying/Bolt/Lightspeed),
//!   DualSense/DualShock, Xbox e qualquer Bluetooth com bateria (BlueZ).
//! - macOS: `system_profiler` (Magic Mouse/Keyboard/Trackpad, AirPods, Bluetooth).
//! - Windows: carga Bluetooth que o sistema mantém (SetupAPI) e controles Xbox.
//!
//! A bateria do notebook continua em `sistema.rs`; aqui ficam só os periféricos.
//! O monitor emite `perifericos` e atualiza a bandeja apenas quando a lista muda.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "linux")]
mod linux;
// Também nos testes do Linux: a leitura do JSON do macOS é Rust puro.
#[cfg(any(target_os = "macos", test))]
mod macos;
#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
mod sem_suporte;
#[cfg(windows)]
mod win;

#[cfg(target_os = "linux")]
use linux as plataforma;
#[cfg(target_os = "macos")]
use macos as plataforma;
#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
use sem_suporte as plataforma;
#[cfg(windows)]
use win as plataforma;

/// A ordem da declaração é a ordem na barra (headset primeiro, como no BatteryHub).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Tipo {
    Headset,
    Fones,
    Mouse,
    Teclado,
    Controle,
    Caneta,
    Outro,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Estado {
    Descarregando,
    Carregando,
    Cheia,
    Desconhecido,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Conexao {
    Bluetooth,
    /// Receptor USB do fabricante (ex.: Logitech Unifying/Bolt/Lightspeed).
    /// Por enquanto só o Linux identifica (pelo driver hid-logitech-hidpp).
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    Receptor,
    Desconhecida,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dispositivo {
    /// Identidade estável entre leituras (no Linux, o native-path do UPower).
    pub id: String,
    pub nome: String,
    pub tipo: Tipo,
    pub percentual: u8,
    pub estado: Estado,
    pub conexao: Conexao,
}

/// Palpite do tipo pelo nome, para sistemas que não informam (Windows).
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn tipo_pelo_nome(nome: &str) -> Tipo {
    let n = nome.to_lowercase();
    let tem = |palavras: &[&str]| palavras.iter().any(|p| n.contains(p));
    if tem(&["headset", "arctis", "cloud", "blackshark", "barracuda"]) {
        Tipo::Headset
    } else if tem(&["buds", "airpods", "headphone", "fone", "wh-", "wf-", "beats", "earbud"]) {
        Tipo::Fones
    } else if tem(&["mouse", "mx master", "mx anywhere", "trackball"]) {
        Tipo::Mouse
    } else if tem(&["keyboard", "teclado", "keys", "k380", "k780"]) {
        Tipo::Teclado
    } else if tem(&["controller", "controle", "gamepad", "dualsense", "dualshock", "xbox", "8bitdo"]) {
        Tipo::Controle
    } else if tem(&["pen", "caneta", "stylus"]) {
        Tipo::Caneta
    } else {
        Tipo::Outro
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn tipo_pelo_nome_cobre_nomes_comuns() {
        assert_eq!(tipo_pelo_nome("Logitech MX Master 3S"), Tipo::Mouse);
        assert_eq!(tipo_pelo_nome("Pebble K380s"), Tipo::Teclado);
        assert_eq!(tipo_pelo_nome("Galaxy Buds2 Pro"), Tipo::Fones);
        assert_eq!(tipo_pelo_nome("Xbox Wireless Controller"), Tipo::Controle);
        assert_eq!(tipo_pelo_nome("HyperX Cloud III"), Tipo::Headset);
        assert_eq!(tipo_pelo_nome("Alto-falante JBL"), Tipo::Outro);
    }
}

/// Última lista lida, para o comando e para redesenhar a bandeja.
#[derive(Default)]
pub struct Perifericos(pub Mutex<Vec<Dispositivo>>);

#[tauri::command]
pub fn perifericos_atuais(estado: tauri::State<Perifericos>) -> Vec<Dispositivo> {
    estado.0.lock().map(|l| l.clone()).unwrap_or_default()
}

pub fn monitorar(app: AppHandle) {
    app.manage(Perifericos::default());
    std::thread::spawn(move || {
        plataforma::observar(|mut lista| {
            lista.sort_by(|a, b| a.tipo.cmp(&b.tipo).then_with(|| a.nome.cmp(&b.nome)));
            {
                let estado = app.state::<Perifericos>();
                let Ok(mut atual) = estado.0.lock() else { return };
                if *atual == lista {
                    return;
                }
                *atual = lista.clone();
            }
            let _ = app.emit("perifericos", &lista);
            crate::bandeja::mostrar_perifericos(&app, &lista);
        });
    });
}
