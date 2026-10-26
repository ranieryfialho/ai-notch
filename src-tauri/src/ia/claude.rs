use reqwest::header::HeaderMap;

use super::{JanelaUso, ProvedorInfo};

pub const ID: &str = "claude";

const URL_MENSAGENS: &str = "https://api.anthropic.com/v1/messages";

pub const INFO: ProvedorInfo = ProvedorInfo {
    id: ID,
    rotulo: "Claude Code",
    rotulo_token: "Token OAuth",
    exemplo_token: "sk-ant-oat01-...",
    ajuda: "Gere com o comando `claude setup-token` na CLI do Claude Code.",
    passos: &[
        "Instale a CLI, se ainda não tiver: npm install -g @anthropic-ai/claude-code",
        "No terminal, rode: claude setup-token",
        "Faça login na conta Anthropic pelo link que abrir no navegador",
        "Copie o token gerado (começa com sk-ant-oat01-...)",
        "Cole no campo acima e clique em Salvar",
    ],
    login_navegador: false,
};

pub fn token_valido(token: &str) -> bool {
    token
        .strip_prefix("sk-ant-")
        .is_some_and(|resto| !resto.is_empty() && resto.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'))
}

fn janela(headers: &HeaderMap, prefixo: &str, rotulo: &str) -> JanelaUso {
    let numero = |nome: String| headers.get(nome).and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<f64>().ok());
    JanelaUso {
        rotulo: rotulo.into(),
        utilizacao: numero(format!("anthropic-ratelimit-unified-{prefixo}-utilization")),
        // O header vem em epoch segundos (ex.: "1786151400"), não ISO 8601.
        reseta_em: numero(format!("anthropic-ratelimit-unified-{prefixo}-reset")).map(|s| (s * 1000.0) as i64),
    }
}

/// A Anthropic devolve o consumo da assinatura nos headers de qualquer
/// resposta; uma mensagem de 1 token é a forma mais barata de lê-los.
pub async fn uso(cliente: &reqwest::Client, token: &str) -> Result<Vec<JanelaUso>, String> {
    let resposta = cliente
        .post(URL_MENSAGENS)
        .bearer_auth(token)
        .header("anthropic-version", "2023-06-01")
        .json(&serde_json::json!({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 1,
            "messages": [{ "role": "user", "content": "hi" }],
        }))
        .send()
        .await
        .map_err(|e| format!("Sem conexão com a API da Anthropic: {e}"))?;

    // 429 é justamente "limite estourado": os headers continuam válidos.
    let status = resposta.status();
    if !status.is_success() && status.as_u16() != 429 {
        return Err(match status.as_u16() {
            401 | 403 => "Token do Claude recusado — gere outro com `claude setup-token`.".into(),
            codigo => format!("Falha ao consultar uso do Claude (status {codigo})"),
        });
    }

    let headers = resposta.headers();
    Ok(vec![
        janela(headers, "5h", "Janela de 5 horas"),
        janela(headers, "7d", "Janela de 7 dias"),
    ])
}
