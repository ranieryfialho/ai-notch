//! Teclado do sistema inteiro, para o "segure para falar".
//! - Linux: lê os teclados direto de /dev/input (evdev), como o Open Whisper
//!   no Wayland, onde não há API de teclado global. Precisa do grupo `input`.
//! - Windows e macOS: consulta o estado das teclas a cada 15 ms
//!   (GetAsyncKeyState / CGEventSourceKeyState), sem instalar hook no sistema.

use std::sync::Arc;

use serde::Serialize;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatusTeclado {
    /// "evdev", "consulta" ou "nenhum".
    pub backend: &'static str,
    pub erro: Option<String>,
}

pub type AoTeclar = Arc<dyn Fn(u32, bool) + Send + Sync>;

pub fn iniciar(ao_teclar: AoTeclar) -> StatusTeclado {
    plataforma::iniciar(ao_teclar)
}

#[cfg(target_os = "linux")]
mod plataforma {
    use std::collections::HashSet;
    use std::fs::File;
    use std::io::Read;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use super::{AoTeclar, StatusTeclado};
    use crate::ditado::teclas::de_evdev;

    /// struct input_event em 64 bits: timeval (16) + type u16 + code u16 + value i32.
    const TAMANHO_EVENTO: usize = 24;
    const EV_KEY: u16 = 1;

    pub fn iniciar(ao_teclar: AoTeclar) -> StatusTeclado {
        let teclados = listar_teclados();
        if teclados.is_empty() {
            return StatusTeclado { backend: "nenhum", erro: Some("Nenhum teclado encontrado em /dev/input.".into()) };
        }
        // Alguns teclados podem abrir (receptores com permissão extra) e outros não:
        // aí o atalho só funciona em parte, e o usuário precisa saber quais.
        let negados: Vec<&str> = teclados.iter().filter(|(caminho, _)| File::open(caminho).is_err()).map(|(_, nome)| nome.as_str()).collect();
        if negados.len() == teclados.len() {
            return StatusTeclado { backend: "nenhum", erro: Some(ajuda_grupo_input()) };
        }
        let erro = (!negados.is_empty()).then(|| format!("Sem permissão para ler: {}. O atalho não funciona neles. {}", negados.join(", "), ajuda_grupo_input()));
        let abertos = Arc::new(Mutex::new(HashSet::new()));
        // Teclados que chegam depois (USB, Bluetooth) entram na varredura seguinte.
        std::thread::spawn(move || loop {
            for (caminho, _) in listar_teclados() {
                let novo = abertos.lock().map(|mut a| a.insert(caminho.clone())).unwrap_or(false);
                if novo {
                    let (ao_teclar, abertos) = (ao_teclar.clone(), abertos.clone());
                    std::thread::spawn(move || {
                        ler(&caminho, &ao_teclar);
                        if let Ok(mut a) = abertos.lock() {
                            a.remove(&caminho);
                        }
                    });
                }
            }
            std::thread::sleep(Duration::from_secs(3));
        });
        StatusTeclado { backend: "evdev", erro }
    }

    /// Bloqueia lendo eventos até o teclado sumir (ou faltar permissão).
    fn ler(caminho: &str, ao_teclar: &AoTeclar) {
        let Ok(mut arquivo) = File::open(caminho) else { return };
        let mut buffer = [0u8; TAMANHO_EVENTO * 64];
        while let Ok(lidos) = arquivo.read(&mut buffer) {
            if lidos == 0 {
                return;
            }
            for evento in buffer[..lidos].as_chunks::<TAMANHO_EVENTO>().0 {
                let tipo = u16::from_le_bytes([evento[16], evento[17]]);
                let codigo = u16::from_le_bytes([evento[18], evento[19]]);
                let valor = i32::from_le_bytes([evento[20], evento[21], evento[22], evento[23]]);
                // valor 2 = autorrepetição.
                if tipo == EV_KEY && valor != 2 {
                    ao_teclar(de_evdev(codigo), valor == 1);
                }
            }
        }
    }

    /// Teclados de verdade em /proc/bus/input/devices: EV_KEY + autorrepetição (EV_REP).
    /// (caminho, nome) de cada teclado.
    fn listar_teclados() -> Vec<(String, String)> {
        let Ok(texto) = std::fs::read_to_string("/proc/bus/input/devices") else { return Vec::new() };
        texto
            .split("\n\n")
            .filter_map(|bloco| {
                let linha = |prefixo: &str| bloco.lines().find_map(|l| l.strip_prefix(prefixo)).unwrap_or_default();
                let nome = linha("N: Name=");
                let manipuladores = linha("H: Handlers=");
                let ev = u64::from_str_radix(linha("B: EV=").trim(), 16).unwrap_or(0);
                let teclado = manipuladores.split_whitespace().any(|h| h == "kbd") && ev & (1 << EV_KEY) != 0 && ev & (1 << 20) != 0;
                // O teclado virtual do ydotool (que usamos para colar) fica de fora.
                if !teclado || nome.to_lowercase().contains("ydotool") {
                    return None;
                }
                let evento = manipuladores.split_whitespace().find(|h| h.starts_with("event"))?;
                Some((format!("/dev/input/{evento}"), nome.trim_matches('"').to_string()))
            })
            .collect()
    }

    fn ajuda_grupo_input() -> String {
        // Já está no grupo, mas este processo não herdou: sessão aberta antes do
        // usermod, ou o app rodando num contêiner (toolbox/distrobox).
        let usuario = std::env::var("USER").unwrap_or_default();
        let membro = ["/etc/group", "/usr/lib/group"].iter().any(|arquivo| {
            std::fs::read_to_string(arquivo)
                .is_ok_and(|t| t.lines().any(|l| l.starts_with("input:") && l.rsplit(':').next().is_some_and(|m| m.split(',').any(|u| u == usuario))))
        });
        if membro && !usuario.is_empty() {
            return "Você já está no grupo input, mas o AI Notch não recebeu essa permissão: saia e entre de novo na sessão (ou abra o app fora de contêineres como toolbox).".into();
        }
        let tem = |arquivo: &str| std::fs::read_to_string(arquivo).is_ok_and(|t| t.lines().any(|l| l.starts_with("input:")));
        // Distros atômicas (Silverblue, Bluefin...) definem o grupo só em /usr/lib/group.
        let preparo = if tem("/usr/lib/group") && !tem("/etc/group") { "grep -E '^input:' /usr/lib/group | sudo tee -a /etc/group  e depois " } else { "" };
        format!("O atalho global precisa ler o teclado em /dev/input. Rode no terminal: {preparo}sudo usermod -aG input $USER  e saia e entre de novo na sessão.")
    }
}

#[cfg(any(windows, target_os = "macos"))]
mod plataforma {
    use std::time::Duration;

    use super::{AoTeclar, StatusTeclado};
    use crate::ditado::teclas::TABELA;

    pub fn iniciar(ao_teclar: AoTeclar) -> StatusTeclado {
        std::thread::spawn(move || {
            let mut apertadas = vec![false; TABELA.len()];
            loop {
                for (i, &(codigo, vk, mac)) in TABELA.iter().enumerate() {
                    let agora = apertada(vk, mac);
                    if agora != apertadas[i] {
                        apertadas[i] = agora;
                        ao_teclar(codigo, agora);
                    }
                }
                std::thread::sleep(Duration::from_millis(15));
            }
        });
        StatusTeclado { backend: "consulta", erro: None }
    }

    #[cfg(windows)]
    fn apertada(vk: u16, _mac: u16) -> bool {
        use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
        // Bit mais alto = tecla pressionada agora.
        unsafe { GetAsyncKeyState(vk as i32) as u16 & 0x8000 != 0 }
    }

    #[cfg(target_os = "macos")]
    fn apertada(_vk: u16, mac: u16) -> bool {
        #[link(name = "CoreGraphics", kind = "framework")]
        unsafe extern "C" {
            fn CGEventSourceKeyState(estado: i32, tecla: u16) -> bool;
        }
        // 1 = kCGEventSourceStateHIDSystemState (o teclado físico, qualquer app em foco).
        mac != 0xFFFF && unsafe { CGEventSourceKeyState(1, mac) }
    }
}

#[cfg(not(any(target_os = "linux", windows, target_os = "macos")))]
mod plataforma {
    use super::{AoTeclar, StatusTeclado};

    pub fn iniciar(_ao_teclar: AoTeclar) -> StatusTeclado {
        StatusTeclado { backend: "nenhum", erro: Some("Atalho global não suportado neste sistema.".into()) }
    }
}
