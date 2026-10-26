use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Sessao, GlobalSystemMediaTransportControlsSessionManager as Gerenciador,
    GlobalSystemMediaTransportControlsSessionMediaProperties as Propriedades,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};
use windows::Storage::Streams::DataReader;

use super::{Acao, Midia};

/// A capa vem como stream; ler a cada segundo seria desperdício, então guardamos
/// a última por faixa (título + artista).
static CAPA: Mutex<Option<(String, Option<String>)>> = Mutex::new(None);

/// Diferença entre a época do FILETIME (1601) e a do Unix, em unidades de 100ns.
const EPOCA_FILETIME: i64 = 116_444_736_000_000_000;

fn agora_filetime() -> i64 {
    let desde_unix = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    EPOCA_FILETIME + (desde_unix.as_nanos() / 100) as i64
}

pub fn agora() -> Result<Option<Midia>, String> {
    ler().map_err(|e| e.message().to_string())
}

/// O Windows elege como "atual" a última sessão que mexeu, que pode ser uma aba
/// pausada (ex.: um áudio do WhatsApp) enquanto o Spotify toca. Preferimos a
/// sessão que está tocando; só sem nenhuma tocando usamos a "atual".
fn sessao_ativa() -> windows::core::Result<Option<Sessao>> {
    let gerenciador = Gerenciador::RequestAsync()?.get()?;
    let atual = gerenciador.GetCurrentSession().ok();
    if let Some(s) = &atual {
        if s.GetPlaybackInfo()?.PlaybackStatus()? == Status::Playing {
            return Ok(atual);
        }
    }
    for sessao in gerenciador.GetSessions()? {
        if sessao.GetPlaybackInfo().and_then(|i| i.PlaybackStatus()).is_ok_and(|s| s == Status::Playing) {
            return Ok(Some(sessao));
        }
    }
    Ok(atual)
}

fn ler() -> windows::core::Result<Option<Midia>> {
    let Some(sessao) = sessao_ativa()? else {
        return Ok(None);
    };

    let props = sessao.TryGetMediaPropertiesAsync()?.get()?;
    let titulo = props.Title()?.to_string();
    if titulo.is_empty() {
        return Ok(None);
    }
    let artista = props.Artist()?.to_string();
    let album = props.AlbumTitle()?.to_string();

    let tocando = sessao.GetPlaybackInfo()?.PlaybackStatus()? == Status::Playing;

    // Position é a posição no instante LastUpdatedTime; o player não atualiza
    // continuamente, então projetamos o tempo decorrido desde então.
    let linha = sessao.GetTimelineProperties()?;
    let inicio = linha.StartTime()?.Duration;
    let fim = linha.EndTime()?.Duration;
    let mut posicao = linha.Position()?.Duration - inicio;
    if tocando {
        let atualizado = linha.LastUpdatedTime()?.UniversalTime;
        let decorrido = agora_filetime() - atualizado;
        if atualizado > 0 && decorrido > 0 {
            posicao += decorrido;
        }
    }
    let duracao = (fim - inicio).max(0);
    let posicao = if duracao > 0 { posicao.clamp(0, duracao) } else { posicao.max(0) };

    let chave = format!("{titulo}\u{0}{artista}");
    let capa = {
        let mut cache = CAPA.lock().unwrap();
        match cache.as_ref() {
            Some((k, capa)) if *k == chave => capa.clone(),
            _ => {
                let capa = ler_capa(&props).ok().flatten();
                *cache = Some((chave, capa.clone()));
                capa
            }
        }
    };

    Ok(Some(Midia {
        titulo,
        artista,
        album,
        duracao_ms: (duracao / 10_000) as u64,
        posicao_ms: (posicao / 10_000) as u64,
        tocando,
        capa,
        fonte: sessao.SourceAppUserModelId().map(|s| s.to_string()).unwrap_or_default(),
    }))
}

fn ler_capa(props: &Propriedades) -> windows::core::Result<Option<String>> {
    let Ok(referencia) = props.Thumbnail() else {
        return Ok(None);
    };
    let stream = referencia.OpenReadAsync()?.get()?;
    let tamanho = stream.Size()? as u32;
    if tamanho == 0 {
        return Ok(None);
    }
    let leitor = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
    // Alguns apps (ex.: Spotify) entregam o stream em pedaços: LoadAsync pode
    // carregar menos que o tamanho pedido, e a imagem chegaria truncada.
    let mut bytes = Vec::with_capacity(tamanho as usize);
    while bytes.len() < tamanho as usize {
        let carregados = leitor.LoadAsync(tamanho - bytes.len() as u32)?.get()?;
        if carregados == 0 {
            break;
        }
        let mut pedaco = vec![0u8; carregados as usize];
        leitor.ReadBytes(&mut pedaco)?;
        bytes.extend_from_slice(&pedaco);
    }

    // O ContentType informado nem sempre é confiável; o cabeçalho do arquivo é.
    let tipo = match bytes.get(..4) {
        Some([0x89, b'P', b'N', b'G']) => "image/png",
        Some([0xFF, 0xD8, ..]) => "image/jpeg",
        Some([b'R', b'I', b'F', b'F']) => "image/webp",
        Some([b'G', b'I', b'F', _]) => "image/gif",
        _ => return Ok(None),
    };
    Ok(Some(format!("data:{tipo};base64,{}", STANDARD.encode(bytes))))
}

pub fn comando(acao: Acao) -> Result<(), String> {
    executar(acao).map_err(|e| e.message().to_string())
}

fn executar(acao: Acao) -> windows::core::Result<()> {
    let Some(sessao) = sessao_ativa()? else {
        return Ok(());
    };
    match acao {
        Acao::TocarPausar => sessao.TryTogglePlayPauseAsync()?.get()?,
        Acao::Proxima => sessao.TrySkipNextAsync()?.get()?,
        Acao::Anterior => sessao.TrySkipPreviousAsync()?.get()?,
    };
    Ok(())
}
