//! Áudio → texto. Mesmo comportamento do Open Whisper:
//! - local: Whisper no computador (whisper.cpp), modelo baixado na primeira vez;
//! - OpenAI e Groq: endpoint /audio/transcriptions;
//! - OpenRouter: um modelo multimodal ouve o áudio e já devolve o texto limpo;
//! - "limpeza com IA" opcional numa segunda passada, para quem só transcreve.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::config::ConfigDitado;
use super::gravador;
use crate::ia::cofre;

const OPENAI: &str = "https://api.openai.com/v1";
const GROQ: &str = "https://api.groq.com/openai/v1";
const OPENROUTER: &str = "https://openrouter.ai/api/v1";

const REGRAS_LIMPEZA: &str = "Remova hesitações (é, hã, hum, tipo, sabe), repetições e falsos começos. Quando a pessoa se corrigir \
     (\"não, quer dizer…\"), mantenha só a versão final. Corrija pontuação e maiúsculas. Não resuma, não traduza \
     e não mude o estilo nem o sentido.";

pub struct Resultado {
    pub texto: String,
    pub texto_bruto: Option<String>,
    pub provedor: String,
    pub modelo: String,
}

/// Id da chave de um provedor no cofre do sistema.
pub fn id_chave(provedor: &str) -> String {
    format!("ditado-{provedor}")
}

pub fn chave(app: &AppHandle, provedor: &str) -> Option<String> {
    cofre::ler(app, &id_chave(provedor)).ok().filter(|c| !c.trim().is_empty())
}

pub async fn transcrever(app: &AppHandle, cfg: &ConfigDitado, amostras: &[f32], progresso: impl Fn(f32)) -> Result<Resultado, String> {
    let provedor = cfg.provedor.clone();
    let modelo = cfg.modelo_atual();
    let mut texto = match provedor.as_str() {
        "local" => local(app, &modelo, &cfg.idioma, amostras, progresso).await?,
        "openrouter" => {
            let chave = chave(app, "openrouter").ok_or("Configure a chave do OpenRouter")?;
            openrouter(&chave, &modelo, &gravador::wav(amostras), &cfg.idioma, cfg.limpeza).await?
        }
        "openai" | "groq" => {
            let chave = chave(app, &provedor).ok_or_else(|| format!("Configure a chave da {}", if provedor == "openai" { "OpenAI" } else { "Groq" }))?;
            openai_compativel(&provedor, &chave, &modelo, gravador::wav(amostras), &cfg.idioma).await?
        }
        outro => return Err(format!("Provedor desconhecido: {outro}")),
    };

    // O OpenRouter já limpa na mesma chamada; os outros precisam de uma segunda passada.
    let mut texto_bruto = None;
    if cfg.limpeza && provedor != "openrouter" && !texto.is_empty() {
        if let Some((servico, chave)) = ["openrouter", "openai", "groq"].iter().find_map(|p| chave(app, p).map(|c| (*p, c))) {
            let limpo = limpar(servico, &chave, &texto).await?;
            texto_bruto = Some(std::mem::replace(&mut texto, limpo));
        }
    }
    Ok(Resultado { texto, texto_bruto, provedor, modelo })
}

// ---- Nuvem -------------------------------------------------------------------

fn cliente() -> reqwest::Client {
    reqwest::Client::builder().timeout(Duration::from_secs(120)).build().unwrap_or_default()
}

async fn falha(resposta: reqwest::Response) -> String {
    let status = resposta.status().as_u16();
    let corpo: Value = resposta.json().await.unwrap_or_default();
    let detalhe = corpo.pointer("/error/message").or_else(|| corpo.get("message")).and_then(Value::as_str).map(String::from).unwrap_or_else(|| corpo.to_string());
    match status {
        401 => "Chave inválida ou expirada".into(),
        402 => "Sem créditos no serviço".into(),
        429 => "Limite de uso atingido, tente de novo em instantes".into(),
        _ => format!("Erro {status}: {detalhe}"),
    }
}

fn base(provedor: &str) -> &'static str {
    match provedor {
        "groq" => GROQ,
        "openrouter" => OPENROUTER,
        _ => OPENAI,
    }
}

async fn openai_compativel(provedor: &str, chave: &str, modelo: &str, wav: Vec<u8>, idioma: &str) -> Result<String, String> {
    let arquivo = reqwest::multipart::Part::bytes(wav).file_name("audio.wav").mime_str("audio/wav").map_err(|e| e.to_string())?;
    let mut formulario = reqwest::multipart::Form::new().part("file", arquivo).text("model", modelo.to_string()).text("response_format", "json");
    if idioma != "auto" {
        formulario = formulario.text("language", idioma.to_string());
    }
    let resposta = cliente()
        .post(format!("{}/audio/transcriptions", base(provedor)))
        .bearer_auth(chave)
        .multipart(formulario)
        .send()
        .await
        .map_err(|e| format!("Sem conexão com o serviço: {e}"))?;
    if !resposta.status().is_success() {
        return Err(falha(resposta).await);
    }
    let corpo: Value = resposta.json().await.map_err(|e| e.to_string())?;
    Ok(corpo.get("text").and_then(Value::as_str).unwrap_or_default().trim().to_string())
}

async fn openrouter(chave: &str, modelo: &str, wav: &[u8], idioma: &str, limpeza: bool) -> Result<String, String> {
    let lingua = if idioma == "auto" { String::new() } else { format!(" O idioma principal é {}.", nome_idioma(idioma)) };
    let estilo = if limpeza { format!("{REGRAS_LIMPEZA} ") } else { "Transcreva palavra por palavra. ".into() };
    let prompt = format!(
        "Transcreva este áudio. Escreva cada trecho no idioma em que foi falado: se a pessoa trocar de idioma no meio, troque também, sem traduzir.{lingua} \
         Use pontuação e maiúsculas corretas. {estilo}Responda somente com a transcrição, sem comentários, aspas ou rótulos. Se não houver fala, responda vazio."
    );
    let corpo = json!({
        "model": modelo,
        "temperature": 0,
        "messages": [{
            "role": "user",
            "content": [
                { "type": "text", "text": prompt },
                { "type": "input_audio", "input_audio": { "data": base64::engine::general_purpose::STANDARD.encode(wav), "format": "wav" } }
            ]
        }]
    });
    conversa(OPENROUTER, chave, &corpo).await
}

async fn limpar(provedor: &str, chave: &str, texto: &str) -> Result<String, String> {
    let modelo = match provedor {
        "openrouter" => "google/gemini-2.5-flash-lite",
        "groq" => "llama-3.3-70b-versatile",
        _ => "gpt-4.1-mini",
    };
    let corpo = json!({
        "model": modelo,
        "temperature": 0,
        "messages": [
            { "role": "system", "content": format!("Você edita textos ditados por voz. {REGRAS_LIMPEZA} Responda só com o texto editado.") },
            { "role": "user", "content": texto }
        ]
    });
    let limpo = conversa(base(provedor), chave, &corpo).await?;
    Ok(if limpo.is_empty() { texto.to_string() } else { limpo })
}

async fn conversa(base: &str, chave: &str, corpo: &Value) -> Result<String, String> {
    let resposta = cliente()
        .post(format!("{base}/chat/completions"))
        .bearer_auth(chave)
        .header("X-Title", "AI Notch")
        .json(corpo)
        .send()
        .await
        .map_err(|e| format!("Sem conexão com o serviço: {e}"))?;
    if !resposta.status().is_success() {
        return Err(falha(resposta).await);
    }
    let corpo: Value = resposta.json().await.map_err(|e| e.to_string())?;
    Ok(corpo.pointer("/choices/0/message/content").and_then(Value::as_str).unwrap_or_default().trim().to_string())
}

/// Confere a chave sem gastar créditos (lista de modelos ou dados da chave).
pub async fn verificar_chave(provedor: &str, chave: &str) -> Result<(), String> {
    let url = if provedor == "openrouter" { format!("{OPENROUTER}/key") } else { format!("{}/models", base(provedor)) };
    let resposta = cliente().get(url).bearer_auth(chave).timeout(Duration::from_secs(15)).send().await.map_err(|e| format!("Sem conexão com o serviço: {e}"))?;
    if resposta.status().is_success() {
        Ok(())
    } else {
        Err(falha(resposta).await)
    }
}

fn nome_idioma(id: &str) -> &str {
    match id {
        "pt" => "Português",
        "en" => "Inglês",
        "es" => "Espanhol",
        "fr" => "Francês",
        "de" => "Alemão",
        "it" => "Italiano",
        "ru" => "Russo",
        "ja" => "Japonês",
        "zh" => "Chinês",
        outro => outro,
    }
}

// ---- Local (whisper.cpp) -------------------------------------------------------

/// Modelos ggml do whisper.cpp (Hugging Face), equivalentes aos do Open Whisper.
pub const MODELOS_LOCAIS: [(&str, &str); 3] = [
    ("small", "ggml-small-q8_0.bin"),
    ("base", "ggml-base.bin"),
    ("large-v3-turbo", "ggml-large-v3-turbo-q5_0.bin"),
];

fn arquivo_modelo(modelo: &str) -> &'static str {
    MODELOS_LOCAIS.iter().find(|(id, _)| *id == modelo).map(|(_, arquivo)| *arquivo).unwrap_or(MODELOS_LOCAIS[0].1)
}

pub fn pasta_modelos(app: &AppHandle) -> Result<PathBuf, String> {
    let pasta = app.path().app_data_dir().map_err(|e| e.to_string())?.join("modelos");
    std::fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    Ok(pasta)
}

/// Contexto carregado fica na memória entre um ditado e outro (carregar leva segundos).
static CONTEXTO: Mutex<Option<(String, WhisperContext)>> = Mutex::new(None);

async fn local(app: &AppHandle, modelo: &str, idioma: &str, amostras: &[f32], progresso: impl Fn(f32)) -> Result<String, String> {
    let caminho = pasta_modelos(app)?.join(arquivo_modelo(modelo));
    if !caminho.exists() {
        baixar(arquivo_modelo(modelo), &caminho, &progresso).await?;
    }

    let mut contexto = CONTEXTO.lock().map_err(|_| "Whisper indisponível")?;
    let chave_modelo = caminho.to_string_lossy().to_string();
    if contexto.as_ref().map(|(c, _)| c != &chave_modelo).unwrap_or(true) {
        whisper_rs::install_logging_hooks();
        let novo = WhisperContext::new_with_params(&caminho, WhisperContextParameters::default()).map_err(|e| format!("Não consegui carregar o modelo: {e}"))?;
        *contexto = Some((chave_modelo, novo));
    }
    let (_, ctx) = contexto.as_ref().ok_or("Whisper indisponível")?;
    let mut estado = ctx.create_state().map_err(|e| e.to_string())?;

    let mut parametros = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    parametros.set_language(Some(if idioma == "auto" { "auto" } else { idioma }));
    let nucleos = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    parametros.set_n_threads(nucleos.clamp(1, 8) as i32);
    parametros.set_print_progress(false);
    parametros.set_print_realtime(false);
    parametros.set_print_timestamps(false);
    parametros.set_print_special(false);
    parametros.set_no_context(true);
    parametros.set_suppress_blank(true);

    estado.full(parametros, amostras).map_err(|e| format!("Falha na transcrição: {e}"))?;
    let texto: String = estado.as_iter().filter_map(|s| s.to_str_lossy().ok().map(|t| t.to_string())).collect();
    Ok(texto.trim().to_string())
}

/// Baixa o modelo para um `.parte` e só renomeia no fim (download interrompido não vale).
async fn baixar(arquivo: &str, destino: &Path, progresso: &impl Fn(f32)) -> Result<(), String> {
    use std::io::Write;

    let url = format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{arquivo}");
    let mut resposta = reqwest::Client::new().get(url).send().await.map_err(|e| format!("Não consegui baixar o modelo: {e}"))?;
    if !resposta.status().is_success() {
        return Err(format!("Não consegui baixar o modelo (erro {})", resposta.status().as_u16()));
    }
    let total = resposta.content_length().unwrap_or(0);
    let parcial = destino.with_extension("parte");
    let mut saida = std::fs::File::create(&parcial).map_err(|e| e.to_string())?;
    let mut recebido = 0u64;
    progresso(0.0);
    while let Some(pedaco) = resposta.chunk().await.map_err(|e| format!("Download interrompido: {e}"))? {
        saida.write_all(&pedaco).map_err(|e| e.to_string())?;
        recebido += pedaco.len() as u64;
        if total > 0 {
            progresso(recebido as f32 / total as f32);
        }
    }
    drop(saida);
    std::fs::rename(&parcial, destino).map_err(|e| e.to_string())
}
