//! Sinais do sistema que viram avisos no notch: bateria e Caps Lock.
//! Rodam em threads próprias e emitem eventos só quando o estado muda.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bateria {
    pub percentual: u8,
    pub conectada: bool,
    pub cheia: bool,
}

fn ler_bateria(gerenciador: &starship_battery::Manager) -> Option<Bateria> {
    use starship_battery::State;

    let bateria = gerenciador.batteries().ok()?.flatten().next()?;
    let estado = bateria.state();
    Some(Bateria {
        percentual: (bateria.state_of_charge().value * 100.0).round().clamp(0.0, 100.0) as u8,
        conectada: matches!(estado, State::Charging | State::Full),
        cheia: estado == State::Full,
    })
}

#[tauri::command]
pub async fn bateria_atual() -> Option<Bateria> {
    let gerenciador = starship_battery::Manager::new().ok()?;
    ler_bateria(&gerenciador)
}

pub fn monitorar_bateria(app: AppHandle) {
    std::thread::spawn(move || {
        // Desktop sem bateria: nada a monitorar.
        let Ok(gerenciador) = starship_battery::Manager::new() else { return };
        let mut ultima: Option<Bateria> = None;
        loop {
            let atual = ler_bateria(&gerenciador);
            if atual.is_none() && ultima.is_none() {
                return;
            }
            if atual != ultima {
                if let Some(b) = &atual {
                    let _ = app.emit("bateria", b);
                }
                ultima = atual;
            }
            std::thread::sleep(Duration::from_secs(5));
        }
    });
}

#[cfg(windows)]
fn caps_lock_ligado() -> Option<bool> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CAPITAL};
    // Bit baixo = estado de alternância (ligado/desligado).
    Some(unsafe { GetKeyState(VK_CAPITAL.0 as i32) } & 1 == 1)
}

#[cfg(not(windows))]
fn caps_lock_ligado() -> Option<bool> {
    // macOS e Linux não expõem o estado do Caps Lock sem permissões de
    // acessibilidade/entrada; o aviso fica só no Windows por enquanto.
    None
}

pub fn monitorar_caps_lock(app: AppHandle) {
    let Some(mut ultimo) = caps_lock_ligado() else { return };
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(250));
        if let Some(atual) = caps_lock_ligado() {
            if atual != ultimo {
                let _ = app.emit("caps-lock", atual);
                ultimo = atual;
            }
        }
    });
}
