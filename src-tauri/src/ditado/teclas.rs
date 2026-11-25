//! Códigos de tecla do ditado: os mesmos do libuiohook usados pelo Open
//! Whisper (scancode set 1; extensões com prefixo 0x0E00), para o atalho
//! configurado lá continuar valendo. Cada sistema traduz para estes códigos.

pub const ESC: u32 = 1;

/// Modificadores, na ordem em que aparecem num atalho ("Ctrl + Super").
pub const MODIFICADORES: [u32; 8] = [29, 3613, 56, 3640, 42, 54, 3675, 3676];

/// (código, tecla virtual do Windows, keycode do macOS). 0xFFFF = não existe.
#[cfg_attr(target_os = "linux", allow(dead_code))]
pub const TABELA: &[(u32, u16, u16)] = &[
    (1, 0x1B, 53),        // Esc
    (14, 0x08, 51),       // Backspace
    (15, 0x09, 48),       // Tab
    (28, 0x0D, 36),       // Enter
    (29, 0xA2, 59),       // Ctrl esquerdo
    (42, 0xA0, 56),       // Shift esquerdo
    (54, 0xA1, 60),       // Shift direito
    (56, 0xA4, 58),       // Alt / Option esquerdo
    (57, 0x20, 49),       // Espaço
    (58, 0x14, 57),       // Caps Lock
    (3613, 0xA3, 62),     // Ctrl direito
    (3640, 0xA5, 61),     // Alt / Option direito
    (3675, 0x5B, 55),     // Super / Cmd esquerdo
    (3676, 0x5C, 54),     // Super / Cmd direito
    (3655, 0x24, 115),    // Home
    (3663, 0x23, 119),    // End
    (3657, 0x21, 116),    // Page Up
    (3665, 0x22, 121),    // Page Down
    (3666, 0x2D, 0xFFFF), // Insert
    (3667, 0x2E, 117),    // Delete
    (57416, 0x26, 126),   // ↑
    (57424, 0x28, 125),   // ↓
    (57419, 0x25, 123),   // ←
    (57421, 0x27, 124),   // →
    // Letras A–Z.
    (30, 0x41, 0),
    (48, 0x42, 11),
    (46, 0x43, 8),
    (32, 0x44, 2),
    (18, 0x45, 14),
    (33, 0x46, 3),
    (34, 0x47, 5),
    (35, 0x48, 4),
    (23, 0x49, 34),
    (36, 0x4A, 38),
    (37, 0x4B, 40),
    (38, 0x4C, 37),
    (50, 0x4D, 46),
    (49, 0x4E, 45),
    (24, 0x4F, 31),
    (25, 0x50, 35),
    (16, 0x51, 12),
    (19, 0x52, 15),
    (31, 0x53, 1),
    (20, 0x54, 17),
    (22, 0x55, 32),
    (47, 0x56, 9),
    (17, 0x57, 13),
    (45, 0x58, 7),
    (21, 0x59, 16),
    (44, 0x5A, 6),
    // Dígitos 1–9 e 0.
    (2, 0x31, 18),
    (3, 0x32, 19),
    (4, 0x33, 20),
    (5, 0x34, 21),
    (6, 0x35, 23),
    (7, 0x36, 22),
    (8, 0x37, 26),
    (9, 0x38, 28),
    (10, 0x39, 25),
    (11, 0x30, 29),
    // F1–F12.
    (59, 0x70, 122),
    (60, 0x71, 120),
    (61, 0x72, 99),
    (62, 0x73, 118),
    (63, 0x74, 96),
    (64, 0x75, 97),
    (65, 0x76, 98),
    (66, 0x77, 100),
    (67, 0x78, 101),
    (68, 0x79, 109),
    (87, 0x7A, 103),
    (88, 0x7B, 111),
];

/// evdev (Linux) → código do ditado. Abaixo de 96 eles coincidem.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn de_evdev(codigo: u16) -> u32 {
    match codigo {
        96 => 3612,
        97 => 3613,
        98 => 3637,
        99 => 3639,
        100 => 3640,
        102 => 3655,
        103 => 57416,
        104 => 3657,
        105 => 57419,
        106 => 57421,
        107 => 3663,
        108 => 57424,
        109 => 3665,
        110 => 3666,
        111 => 3667,
        125 => 3675,
        126 => 3676,
        c => c as u32,
    }
}

/// Modificadores primeiro (na ordem de `MODIFICADORES`), depois o resto.
pub fn ordenar_atalho(teclas: impl IntoIterator<Item = u32>) -> Vec<u32> {
    let mut lista: Vec<u32> = teclas.into_iter().collect();
    lista.sort_unstable();
    lista.dedup();
    let posicao = |t: &u32| MODIFICADORES.iter().position(|m| m == t).unwrap_or(100);
    lista.sort_by(|a, b| posicao(a).cmp(&posicao(b)).then(a.cmp(b)));
    lista
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn atalho_com_modificadores_na_frente() {
        assert_eq!(ordenar_atalho([3675, 29]), vec![29, 3675]);
        assert_eq!(ordenar_atalho([47, 29, 47]), vec![29, 47]);
    }

    #[test]
    fn evdev_vira_codigo_do_ditado() {
        assert_eq!(de_evdev(29), 29);
        assert_eq!(de_evdev(125), 3675);
        assert_eq!(de_evdev(97), 3613);
    }

    #[test]
    fn tabela_sem_codigos_repetidos() {
        let mut codigos: Vec<u32> = TABELA.iter().map(|t| t.0).collect();
        codigos.sort_unstable();
        let total = codigos.len();
        codigos.dedup();
        assert_eq!(codigos.len(), total);
    }
}
