//! Ícone 32×32 com a porcentagem desenhada, para bandejas que não mostram
//! texto ao lado do ícone (Windows, KDE Plasma). É o modo "um ícone por
//! dispositivo" do BatteryHub: uma placa escura arredondada (legível em barra
//! clara ou escura) com os dígitos numa fonte de pixels 3×5.

use tauri::image::Image;

const LADO: usize = 32;

/// Cada dígito em 5 linhas de 3 bits (bit 2 = coluna da esquerda).
const DIGITOS: [[u8; 5]; 10] = [
    [0b111, 0b101, 0b101, 0b101, 0b111],
    [0b010, 0b110, 0b010, 0b010, 0b111],
    [0b111, 0b001, 0b111, 0b100, 0b111],
    [0b111, 0b001, 0b111, 0b001, 0b111],
    [0b101, 0b101, 0b111, 0b001, 0b001],
    [0b111, 0b100, 0b111, 0b001, 0b111],
    [0b111, 0b100, 0b111, 0b101, 0b111],
    [0b111, 0b001, 0b001, 0b001, 0b001],
    [0b111, 0b101, 0b111, 0b101, 0b111],
    [0b111, 0b101, 0b111, 0b001, 0b111],
];

/// `cor` em RGB; a placa é sempre escura para o número aparecer em qualquer tema.
pub fn desenhar(percentual: u8, cor: [u8; 3]) -> Image<'static> {
    let mut rgba = vec![0u8; LADO * LADO * 4];
    let mut pintar = |x: usize, y: usize, c: [u8; 4]| {
        if x < LADO && y < LADO {
            let i = (y * LADO + x) * 4;
            rgba[i..i + 4].copy_from_slice(&c);
        }
    };

    // Placa com cantos arredondados (raio 7).
    let raio = 7i32;
    for y in 0..LADO as i32 {
        for x in 0..LADO as i32 {
            let cx = x.clamp(raio, LADO as i32 - 1 - raio);
            let cy = y.clamp(raio, LADO as i32 - 1 - raio);
            if (x - cx).pow(2) + (y - cy).pow(2) <= raio * raio {
                pintar(x as usize, y as usize, [24, 24, 27, 235]);
            }
        }
    }

    // "100" precisa de dígitos menores para caber.
    let texto = percentual.min(100).to_string();
    let (escala, folga) = if texto.len() >= 3 { (3, 2) } else { (4, 4) };
    let largura = texto.len() * 3 * escala + (texto.len() - 1) * folga;
    let altura = 5 * escala;
    let (x0, y0) = ((LADO - largura) / 2, (LADO - altura) / 2);
    let tinta = [cor[0], cor[1], cor[2], 255];
    for (n, d) in texto.bytes().enumerate() {
        let desenho = DIGITOS[(d - b'0') as usize];
        let xd = x0 + n * (3 * escala + folga);
        for (linha, bits) in desenho.iter().enumerate() {
            for coluna in 0..3 {
                if bits & (0b100 >> coluna) != 0 {
                    for dy in 0..escala {
                        for dx in 0..escala {
                            pintar(xd + coluna * escala + dx, y0 + linha * escala + dy, tinta);
                        }
                    }
                }
            }
        }
    }
    Image::new_owned(rgba, LADO as u32, LADO as u32)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn cabe_no_icone() {
        for pct in [0, 7, 42, 99, 100] {
            let img = desenhar(pct, [255, 255, 255]);
            assert_eq!(img.rgba().len(), LADO * LADO * 4);
            assert!(img.rgba().chunks(4).any(|p| p == [255, 255, 255, 255]), "{pct}% sem dígitos");
        }
    }
}
