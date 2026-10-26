//! Letras via LRCLIB (https://lrclib.net), base aberta e gratuita de letras
//! sincronizadas. Pedem um User-Agent identificando o app.

use serde::{Deserialize, Serialize};

const USER_AGENT: &str = concat!("AI Notch/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RespostaLrclib {
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
    duration: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Letra {
    pub sincronizada: Option<String>,
    pub simples: Option<String>,
}

#[tauri::command]
pub async fn buscar_letra(artista: String, titulo: String, album: String, duracao_seg: f64) -> Result<Option<Letra>, String> {
    let cliente = reqwest::Client::builder().user_agent(USER_AGENT).build().map_err(|e| e.to_string())?;

    // /api/get exige casar duração (±2s); quando o player não informa duração
    // ou a faixa não bate, caímos no /api/search e escolhemos a mais próxima.
    if duracao_seg > 0.0 {
        let resposta = cliente
            .get("https://lrclib.net/api/get")
            .query(&[
                ("artist_name", artista.as_str()),
                ("track_name", titulo.as_str()),
                ("album_name", album.as_str()),
                ("duration", &duracao_seg.round().to_string()),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if resposta.status().is_success() {
            let r: RespostaLrclib = resposta.json().await.map_err(|e| e.to_string())?;
            if r.synced_lyrics.is_some() || r.plain_lyrics.is_some() {
                return Ok(Some(Letra { sincronizada: r.synced_lyrics, simples: r.plain_lyrics }));
            }
        }
    }

    let resultados: Vec<RespostaLrclib> = cliente
        .get("https://lrclib.net/api/search")
        .query(&[("artist_name", artista.as_str()), ("track_name", titulo.as_str())])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let distancia = |r: &RespostaLrclib| match (r.duration, duracao_seg > 0.0) {
        (Some(d), true) => (d - duracao_seg).abs(),
        _ => 0.0,
    };
    let melhor = resultados
        .into_iter()
        .filter(|r| r.synced_lyrics.is_some() || r.plain_lyrics.is_some())
        // Sincronizada primeiro, depois a de duração mais próxima.
        .min_by(|a, b| {
            (a.synced_lyrics.is_none(), distancia(a))
                .partial_cmp(&(b.synced_lyrics.is_none(), distancia(b)))
                .unwrap_or(std::cmp::Ordering::Equal)
        });

    Ok(melhor.map(|r| Letra { sincronizada: r.synced_lyrics, simples: r.plain_lyrics }))
}
