//! Cola o texto no app em foco: área de transferência + Ctrl+V (Cmd+V no Mac).
//! No Wayland não dá para simular teclas pelo X11, então usamos o ydotool
//! (teclado virtual via /dev/uinput), como o Open Whisper; wtype e xdotool
//! ficam de reserva. Sem nenhum deles, o texto fica copiado.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatusColagem {
    /// "ctrl+v", "cmd+v", "ydotool", "wtype", "xdotool" ou "area-de-transferencia".
    pub backend: String,
    pub erro: Option<String>,
}

/// No X11 o conteúdo copiado some quando o `Clipboard` é destruído: fica um vivo.
static AREA: Mutex<Option<arboard::Clipboard>> = Mutex::new(None);

fn com_area<T>(f: impl FnOnce(&mut arboard::Clipboard) -> Result<T, arboard::Error>) -> Result<T, String> {
    let mut area = AREA.lock().map_err(|_| "Área de transferência indisponível")?;
    if area.is_none() {
        *area = Some(arboard::Clipboard::new().map_err(|e| e.to_string())?);
    }
    f(area.as_mut().ok_or("Área de transferência indisponível")?).map_err(|e| e.to_string())
}

pub fn copiar(texto: &str) -> Result<(), String> {
    com_area(|a| a.set_text(texto.to_string()))
}

pub fn status(app: &AppHandle) -> StatusColagem {
    plataforma::status(app)
}

/// Devolve true se simulou a colagem; senão o texto fica só copiado.
pub fn colar(app: &AppHandle, texto: &str, restaurar: bool) -> bool {
    let anterior = com_area(|a| a.get_text()).ok();
    if copiar(texto).is_err() {
        return false;
    }
    std::thread::sleep(Duration::from_millis(40));
    let colou = match plataforma::atalho_colar(app) {
        Ok(colou) => colou,
        Err(e) => {
            eprintln!("ditado: não consegui colar ({e})");
            false
        }
    };
    if colou && restaurar {
        if let Some(anterior) = anterior {
            let texto = texto.to_string();
            // Dá tempo do app de destino ler a área de transferência antes de restaurar.
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(700));
                if com_area(|a| a.get_text()).ok().as_deref() == Some(texto.as_str()) {
                    let _ = copiar(&anterior);
                }
            });
        }
    }
    colou
}

#[cfg(target_os = "linux")]
mod plataforma {
    use std::process::{Child, Command};
    use std::sync::Mutex;
    use std::time::Duration;

    use tauri::{AppHandle, Manager};

    use super::StatusColagem;

    static YDOTOOLD: Mutex<Option<Child>> = Mutex::new(None);

    fn wayland() -> bool {
        std::env::var("XDG_SESSION_TYPE").is_ok_and(|s| s == "wayland") || std::env::var_os("WAYLAND_DISPLAY").is_some()
    }

    fn existe(programa: &str) -> bool {
        Command::new("sh").args(["-c", &format!("command -v {programa}")]).output().is_ok_and(|s| s.status.success())
    }

    fn soquete(app: &AppHandle) -> Option<std::path::PathBuf> {
        let pasta = app.path().app_data_dir().ok()?;
        std::fs::create_dir_all(&pasta).ok()?;
        Some(pasta.join("ydotool.sock"))
    }

    pub fn status(_app: &AppHandle) -> StatusColagem {
        let (backend, erro) = if existe("ydotool") {
            ("ydotool", None)
        } else if wayland() && existe("wtype") {
            let gnome = std::env::var("XDG_CURRENT_DESKTOP").is_ok_and(|d| d.contains("GNOME"));
            ("wtype", gnome.then(|| "O GNOME não aceita o wtype. Instale o ydotool para colar automaticamente.".to_string()))
        } else if !wayland() && existe("xdotool") {
            ("xdotool", None)
        } else {
            (
                "area-de-transferencia",
                Some("Instale o ydotool para colar automaticamente (sudo dnf install ydotool ou sudo apt install ydotool). Por enquanto o texto fica copiado.".to_string()),
            )
        };
        StatusColagem { backend: backend.into(), erro }
    }

    /// O ydotool precisa do daemon; subimos um nosso, com soquete na pasta do app.
    fn garantir_ydotoold(app: &AppHandle) -> Option<std::path::PathBuf> {
        let caminho = soquete(app)?;
        let mut daemon = YDOTOOLD.lock().ok()?;
        let vivo = daemon.as_mut().is_some_and(|d| d.try_wait().ok().flatten().is_none());
        if !vivo && existe("ydotoold") {
            let _ = std::fs::remove_file(&caminho);
            *daemon = Command::new("ydotoold").arg("--socket-path").arg(&caminho).spawn().ok();
            for _ in 0..20 {
                if caminho.exists() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        }
        Some(caminho)
    }

    pub fn atalho_colar(app: &AppHandle) -> Result<bool, String> {
        let status = status(app);
        let saida = match status.backend.as_str() {
            "ydotool" => {
                let soquete = garantir_ydotoold(app).ok_or("Sem pasta para o soquete do ydotool")?;
                // Códigos evdev: 29 = Ctrl esquerdo, 47 = V.
                Command::new("ydotool").args(["key", "29:1", "47:1", "47:0", "29:0"]).env("YDOTOOL_SOCKET", soquete).output()
            }
            "wtype" => Command::new("wtype").args(["-M", "ctrl", "-k", "v", "-m", "ctrl"]).output(),
            "xdotool" => Command::new("xdotool").args(["key", "--clearmodifiers", "ctrl+v"]).output(),
            _ => return Ok(false),
        }
        .map_err(|e| e.to_string())?;
        if saida.status.success() {
            Ok(true)
        } else {
            Err(String::from_utf8_lossy(&saida.stderr).trim().to_string())
        }
    }
}

#[cfg(windows)]
mod plataforma {
    use tauri::AppHandle;
    use windows::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL};

    use super::StatusColagem;

    pub fn status(_app: &AppHandle) -> StatusColagem {
        StatusColagem { backend: "ctrl+v".into(), erro: None }
    }

    fn tecla(vk: VIRTUAL_KEY, soltar: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, dwFlags: if soltar { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) }, ..Default::default() } },
        }
    }

    pub fn atalho_colar(_app: &AppHandle) -> Result<bool, String> {
        let v = VIRTUAL_KEY(0x56);
        let entradas = [tecla(VK_CONTROL, false), tecla(v, false), tecla(v, true), tecla(VK_CONTROL, true)];
        let enviadas = unsafe { SendInput(&entradas, std::mem::size_of::<INPUT>() as i32) };
        Ok(enviadas as usize == entradas.len())
    }
}

#[cfg(target_os = "macos")]
mod plataforma {
    use std::ffi::c_void;

    use tauri::AppHandle;

    use super::StatusColagem;

    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn CGEventCreateKeyboardEvent(fonte: *const c_void, tecla: u16, apertar: bool) -> *mut c_void;
        fn CGEventSetFlags(evento: *mut c_void, flags: u64);
        fn CGEventPost(local: u32, evento: *mut c_void);
        fn CFRelease(objeto: *const c_void);
    }

    pub fn status(_app: &AppHandle) -> StatusColagem {
        let erro = (!unsafe { AXIsProcessTrusted() })
            .then(|| "Permita o AI Notch em Ajustes do Sistema › Privacidade e Segurança › Acessibilidade para colar automaticamente.".to_string());
        StatusColagem { backend: "cmd+v".into(), erro }
    }

    pub fn atalho_colar(_app: &AppHandle) -> Result<bool, String> {
        if !unsafe { AXIsProcessTrusted() } {
            return Ok(false);
        }
        // 9 = tecla V; 0x100000 = kCGEventFlagMaskCommand; 0 = kCGHIDEventTap.
        for apertar in [true, false] {
            unsafe {
                let evento = CGEventCreateKeyboardEvent(std::ptr::null(), 9, apertar);
                if evento.is_null() {
                    return Err("CGEvent indisponível".into());
                }
                CGEventSetFlags(evento, 0x100000);
                CGEventPost(0, evento);
                CFRelease(evento);
            }
        }
        Ok(true)
    }
}

#[cfg(not(any(target_os = "linux", windows, target_os = "macos")))]
mod plataforma {
    use tauri::AppHandle;

    use super::StatusColagem;

    pub fn status(_app: &AppHandle) -> StatusColagem {
        StatusColagem { backend: "area-de-transferencia".into(), erro: None }
    }

    pub fn atalho_colar(_app: &AppHandle) -> Result<bool, String> {
        Ok(false)
    }
}
