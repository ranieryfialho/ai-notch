use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use super::{JanelaUso, ProvedorInfo};

pub const ID: &str = "antigravity";

// Mesmo client público embarcado no app oficial do Antigravity (o mesmo do
// Status Monitor). É um client OAuth de "installed app": o client_secret é só
// um identificador, como o próprio Google documenta para esse tipo de cliente.
// Mesmo assim não fica no código-fonte (o repositório é público): entra na
// compilação via `src-tauri/.segredos.env` (local) ou secrets do GitHub Actions.
const CLIENT_ID: &str = match option_env!("ANTIGRAVITY_CLIENT_ID") {
    Some(v) => v,
    None => "",
};
const CLIENT_SECRET: &str = match option_env!("ANTIGRAVITY_CLIENT_SECRET") {
    Some(v) => v,
    None => "",
};

fn exigir_credenciais() -> Result<(), String> {
    if CLIENT_ID.is_empty() || CLIENT_SECRET.is_empty() {
        return Err("Esta versão foi compilada sem as credenciais do Antigravity (ANTIGRAVITY_CLIENT_ID/SECRET).".into());
    }
    Ok(())
}

const PORTA_CALLBACK: u16 = 51121;
const URL_AUTORIZACAO: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const URL_TOKEN: &str = "https://oauth2.googleapis.com/token";
const URL_LOAD_CODE_ASSIST: &str = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const URL_MODELOS: &str = "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";
const ESCOPOS: [&str; 5] = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
];

pub const INFO: ProvedorInfo = ProvedorInfo {
    id: ID,
    rotulo: "Google Antigravity",
    rotulo_token: "Refresh Token",
    exemplo_token: "1//09....",
    ajuda: "Use \"Entrar com Google\": o app abre o navegador e guarda o acesso sozinho. Colar o refresh token é só o caminho alternativo.",
    passos: &[
        "Clique em \"Entrar com Google\"",
        "Faça login com a conta Google usada nas cotas do Antigravity",
        "Autorize o acesso e volte para o app — a conta aparece na lista",
    ],
    login_navegador: true,
};

pub fn token_valido(token: &str) -> bool {
    // Refresh tokens do Google começam com "1//" e não têm formato fixo depois.
    token
        .strip_prefix("1//")
        .is_some_and(|resto| !resto.is_empty() && resto.bytes().all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b)))
}

#[derive(Deserialize)]
struct RespostaToken {
    access_token: Option<String>,
    refresh_token: Option<String>,
}

async fn renovar_access_token(cliente: &reqwest::Client, refresh_token: &str) -> Result<String, String> {
    exigir_credenciais()?;
    let resposta = cliente
        .post(URL_TOKEN)
        .form(&[
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Sem conexão com o Google: {e}"))?;
    if !resposta.status().is_success() {
        return Err(format!(
            "Falha ao renovar o acesso do Antigravity (status {}) — entre com o Google de novo",
            resposta.status().as_u16()
        ));
    }
    let corpo: RespostaToken = resposta.json().await.map_err(|e| e.to_string())?;
    corpo.access_token.ok_or_else(|| "Resposta do Google sem access_token".into())
}

async fn post_json(cliente: &reqwest::Client, url: &str, access_token: &str, corpo: serde_json::Value) -> Result<serde_json::Value, String> {
    let resposta = cliente
        .post(url)
        .bearer_auth(access_token)
        .header("user-agent", "antigravity/windows/amd64")
        .json(&corpo)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resposta.status().is_success() {
        return Err(format!("Falha ao consultar uso do Antigravity (status {})", resposta.status().as_u16()));
    }
    resposta.json().await.map_err(|e| e.to_string())
}

/// O Antigravity não tem janelas globais 5h/semanal como o Claude: a cota é
/// por modelo (`remainingFraction`). O modelo mais perto do limite vira o
/// "pior caso" da única janela que a API oferece. Sem janela semanal real,
/// uma segunda entrada seria dado inventado.
pub async fn uso(cliente: &reqwest::Client, refresh_token: &str) -> Result<Vec<JanelaUso>, String> {
    let access_token = renovar_access_token(cliente, refresh_token).await?;

    let assist = post_json(cliente, URL_LOAD_CODE_ASSIST, &access_token, serde_json::json!({ "metadata": { "ideType": "ANTIGRAVITY" } })).await?;
    let projeto = match &assist["cloudaicompanionProject"] {
        serde_json::Value::String(s) => s.clone(),
        outro => outro["id"].as_str().unwrap_or_default().to_string(),
    };

    let modelos = post_json(cliente, URL_MODELOS, &access_token, serde_json::json!({ "project": projeto })).await?;

    let mut pior = JanelaUso { rotulo: "Janela de 5 horas".into(), utilizacao: None, reseta_em: None };
    if let Some(mapa) = modelos["models"].as_object() {
        for modelo in mapa.values() {
            let Some(restante) = modelo["quotaInfo"]["remainingFraction"].as_f64() else { continue };
            let usado = 1.0 - restante;
            if pior.utilizacao.is_none_or(|u| usado > u) {
                pior.utilizacao = Some(usado);
                pior.reseta_em = modelo["quotaInfo"]["resetTime"]
                    .as_str()
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .map(|d| d.timestamp_millis());
            }
        }
    }
    Ok(vec![pior])
}

fn aleatorio_base64(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

/// Login OAuth com PKCE e redirect para um servidor local (loopback). No
/// Status Monitor isso exigia um script à parte + pareamento; aqui o app
/// desktop faz o fluxo inteiro sozinho.
pub async fn login_pelo_navegador(app: &AppHandle) -> Result<String, String> {
    exigir_credenciais()?;
    let redirect = format!("http://localhost:{PORTA_CALLBACK}/oauth-callback");
    let verificador = aleatorio_base64(32);
    let desafio = URL_SAFE_NO_PAD.encode(Sha256::digest(verificador.as_bytes()));
    let estado = aleatorio_base64(16);

    let mut url = url::Url::parse(URL_AUTORIZACAO).unwrap();
    url.query_pairs_mut()
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_type", "code")
        .append_pair("scope", &ESCOPOS.join(" "))
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("code_challenge", &desafio)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &estado);

    // "localhost" pode resolver para IPv4 ou IPv6 conforme o navegador; e no
    // Windows um socket IPv6 não aceita IPv4. Escutamos nos dois.
    let v4 = TcpListener::bind(("127.0.0.1", PORTA_CALLBACK)).await;
    let v6 = TcpListener::bind(("::1", PORTA_CALLBACK)).await;
    if v4.is_err() && v6.is_err() {
        return Err(format!("A porta {PORTA_CALLBACK} está em uso — feche outro login do Antigravity e tente de novo."));
    }

    app.opener().open_url(url.as_str(), None::<&str>).map_err(|e| format!("Não consegui abrir o navegador: {e}"))?;

    let espera = async {
        loop {
            let conexao = tokio::select! {
                Ok((s, _)) = async { v4.as_ref().map_err(|_| ())?.accept().await.map_err(|_| ()) } => s,
                Ok((s, _)) = async { v6.as_ref().map_err(|_| ())?.accept().await.map_err(|_| ()) } => s,
                else => return Err("Servidor de login encerrado".to_string()),
            };
            if let Some(resultado) = tratar_callback(conexao, &estado).await {
                return resultado;
            }
        }
    };
    let codigo = tokio::time::timeout(Duration::from_secs(300), espera)
        .await
        .map_err(|_| "O login demorou demais (5 min). Tente de novo.".to_string())??;

    let resposta = reqwest::Client::new()
        .post(URL_TOKEN)
        .form(&[
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("code", codigo.as_str()),
            ("code_verifier", verificador.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resposta.status().is_success() {
        return Err(format!("O Google recusou o código de login (status {})", resposta.status().as_u16()));
    }
    let corpo: RespostaToken = resposta.json().await.map_err(|e| e.to_string())?;
    corpo
        .refresh_token
        .ok_or_else(|| "O Google não devolveu refresh token. Remova o acesso do app na conta Google e tente de novo.".into())
}

/// Responde ao navegador e devolve o código. `None` = requisição que não é o
/// callback (ex.: /favicon.ico), então seguimos esperando.
async fn tratar_callback(mut conexao: TcpStream, estado_esperado: &str) -> Option<Result<String, String>> {
    let mut buf = vec![0u8; 8192];
    let lidos = conexao.read(&mut buf).await.ok()?;
    let requisicao = String::from_utf8_lossy(&buf[..lidos]);
    let caminho = requisicao.lines().next()?.split_whitespace().nth(1)?;
    let url = url::Url::parse(&format!("http://localhost{caminho}")).ok()?;

    if url.path() != "/oauth-callback" {
        let _ = conexao.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
        return None;
    }

    let parametro = |nome: &str| url.query_pairs().find(|(k, _)| k == nome).map(|(_, v)| v.into_owned());
    let resultado = match (parametro("error"), parametro("code"), parametro("state")) {
        (Some(erro), _, _) => Err(format!("Login cancelado: {erro}")),
        (None, Some(codigo), Some(estado)) if estado == estado_esperado => Ok(codigo),
        _ => Err("Resposta de login inválida (state não confere).".to_string()),
    };

    let (titulo, texto) = match &resultado {
        Ok(_) => ("Conta conectada!", "Pode fechar esta aba e voltar para o AI Notch."),
        Err(_) => ("Não deu certo", "Volte para o AI Notch e tente de novo."),
    };
    let html = format!(
        "<!doctype html><meta charset=utf-8><title>AI Notch</title><body style=\"font-family:system-ui;background:#0b0b0c;color:#f4f4f5;display:grid;place-items:center;height:100vh;margin:0\"><div style=text-align:center><h1>{titulo}</h1><p>{texto}</p></div>"
    );
    let resposta = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}",
        html.len()
    );
    let _ = conexao.write_all(resposta.as_bytes()).await;
    Some(resultado)
}
