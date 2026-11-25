//! Microfone pelo cpal (ALSA/PipeWire no Linux, WASAPI no Windows, Core Audio
//! no macOS). Grava na taxa do aparelho, mistura em mono e no fim converte
//! para 16 kHz, que é o que o Whisper e as APIs de transcrição esperam.
//!
//! O `Stream` do cpal não pode trocar de thread em todos os sistemas, então a
//! gravação é criada, mantida e encerrada na thread do ditado.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample};

pub const TAXA: u32 = 16_000;
/// Quantas vezes por segundo o nível do microfone vai para a tela.
const INTERVALO_NIVEL: Duration = Duration::from_millis(50);

pub struct Gravacao {
    _stream: cpal::Stream,
    amostras: Arc<Mutex<Vec<f32>>>,
    taxa: u32,
}

/// Nomes dos microfones, para a tela de configurações.
pub fn microfones() -> Vec<String> {
    cpal::default_host()
        .input_devices()
        .map(|lista| lista.filter_map(|d| d.description().ok().map(|n| n.name().to_string())).collect())
        .unwrap_or_default()
}

/// Começa a gravar. `nivel` recebe o volume (0 a 1) umas 20 vezes por segundo.
pub fn iniciar(microfone: &str, nivel: impl Fn(f32) + Send + 'static) -> Result<Gravacao, String> {
    let host = cpal::default_host();
    let escolhido = (!microfone.is_empty())
        .then(|| host.input_devices().ok()?.find(|d| d.description().is_ok_and(|n| n.name() == microfone)))
        .flatten();
    let aparelho = escolhido.or_else(|| host.default_input_device()).ok_or("Nenhum microfone encontrado.")?;
    let suportada = aparelho.default_input_config().map_err(|e| format!("Microfone indisponível: {e}"))?;
    let canais = suportada.channels() as usize;
    let taxa = suportada.sample_rate();
    let formato = suportada.sample_format();
    let config = suportada.config();

    let amostras = Arc::new(Mutex::new(Vec::with_capacity(taxa as usize * 30)));
    let stream = match formato {
        SampleFormat::F32 => construir::<f32>(&aparelho, config, canais, amostras.clone(), nivel),
        SampleFormat::I16 => construir::<i16>(&aparelho, config, canais, amostras.clone(), nivel),
        SampleFormat::U16 => construir::<u16>(&aparelho, config, canais, amostras.clone(), nivel),
        SampleFormat::I32 => construir::<i32>(&aparelho, config, canais, amostras.clone(), nivel),
        outro => return Err(format!("Formato de áudio não suportado: {outro:?}")),
    }?;
    stream.play().map_err(|e| format!("Não consegui abrir o microfone: {e}"))?;
    Ok(Gravacao { _stream: stream, amostras, taxa })
}

fn construir<T>(aparelho: &cpal::Device, config: cpal::StreamConfig, canais: usize, amostras: Arc<Mutex<Vec<f32>>>, nivel: impl Fn(f32) + Send + 'static) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let mut ultimo_nivel = Instant::now();
    let mut pico = 0f32;
    aparelho
        .build_input_stream::<T, _, _>(
            config,
            move |dados: &[T], _| {
                let mut destino = match amostras.lock() {
                    Ok(d) => d,
                    Err(_) => return,
                };
                for quadro in dados.chunks(canais.max(1)) {
                    let mono = quadro.iter().map(|&s| f32::from_sample_(s)).sum::<f32>() / quadro.len() as f32;
                    pico = pico.max(mono.abs());
                    destino.push(mono);
                }
                drop(destino);
                if ultimo_nivel.elapsed() >= INTERVALO_NIVEL {
                    ultimo_nivel = Instant::now();
                    nivel(pico.min(1.0));
                    pico = 0.0;
                }
            },
            |erro| eprintln!("ditado: erro no microfone ({erro})"),
            None,
        )
        .map_err(|e| format!("Não consegui abrir o microfone: {e}"))
}

impl Gravacao {
    /// Para de gravar e devolve o áudio em 16 kHz mono.
    pub fn parar(self) -> Vec<f32> {
        let taxa = self.taxa;
        let amostras = std::mem::take(&mut *self.amostras.lock().unwrap_or_else(|e| e.into_inner()));
        drop(self);
        reamostrar(&amostras, taxa, TAXA)
    }
}

/// Média dos vizinhos (filtro simples contra serrilhado) + interpolação linear.
/// Para voz em 16 kHz isso basta; o Whisper não é sensível a esse detalhe.
pub fn reamostrar(entrada: &[f32], de: u32, para: u32) -> Vec<f32> {
    if de == para || entrada.is_empty() {
        return entrada.to_vec();
    }
    let razao = de as f64 / para as f64;
    let janela = (razao.floor() as usize).max(1);
    let suavizado: Vec<f32> = if janela > 1 {
        let mut soma = 0f32;
        entrada
            .iter()
            .enumerate()
            .map(|(i, &v)| {
                soma += v;
                if i >= janela {
                    soma -= entrada[i - janela];
                }
                soma / janela.min(i + 1) as f32
            })
            .collect()
    } else {
        entrada.to_vec()
    };
    let total = (entrada.len() as f64 / razao) as usize;
    (0..total)
        .map(|i| {
            let posicao = i as f64 * razao;
            let base = posicao.floor() as usize;
            let fracao = (posicao - base as f64) as f32;
            let a = suavizado[base.min(suavizado.len() - 1)];
            let b = suavizado[(base + 1).min(suavizado.len() - 1)];
            a + (b - a) * fracao
        })
        .collect()
}

/// WAV PCM 16 bits mono, para as APIs da nuvem.
pub fn wav(amostras: &[f32]) -> Vec<u8> {
    let bytes_dados = (amostras.len() * 2) as u32;
    let mut saida = Vec::with_capacity(44 + bytes_dados as usize);
    saida.extend_from_slice(b"RIFF");
    saida.extend_from_slice(&(36 + bytes_dados).to_le_bytes());
    saida.extend_from_slice(b"WAVEfmt ");
    saida.extend_from_slice(&16u32.to_le_bytes());
    saida.extend_from_slice(&1u16.to_le_bytes()); // PCM
    saida.extend_from_slice(&1u16.to_le_bytes()); // mono
    saida.extend_from_slice(&TAXA.to_le_bytes());
    saida.extend_from_slice(&(TAXA * 2).to_le_bytes());
    saida.extend_from_slice(&2u16.to_le_bytes());
    saida.extend_from_slice(&16u16.to_le_bytes());
    saida.extend_from_slice(b"data");
    saida.extend_from_slice(&bytes_dados.to_le_bytes());
    for &s in amostras {
        let s = s.clamp(-1.0, 1.0);
        let inteiro = if s < 0.0 { s * 32768.0 } else { s * 32767.0 };
        saida.extend_from_slice(&(inteiro.round() as i16).to_le_bytes());
    }
    saida
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn reamostra_48k_para_16k() {
        let um_segundo = vec![0.5f32; 48_000];
        let saida = reamostrar(&um_segundo, 48_000, 16_000);
        assert_eq!(saida.len(), 16_000);
        assert!(saida[100..].iter().all(|&v| (v - 0.5).abs() < 1e-4));
    }

    #[test]
    fn wav_tem_cabecalho_e_tamanho_certos() {
        let w = wav(&[0.0, 1.0, -1.0]);
        assert_eq!(&w[0..4], b"RIFF");
        assert_eq!(w.len(), 44 + 6);
        assert_eq!(i16::from_le_bytes([w[46], w[47]]), 32767);
        assert_eq!(i16::from_le_bytes([w[48], w[49]]), -32768);
    }
}
