//! Uso das suas IAs (mesmo modelo do módulo `src/lib/ai-usage` do Status
//! Monitor): cada provider sabe validar o próprio token e devolver as janelas
//! de limite com utilização (0..1) e horário de reset.
//!
//! Para adicionar outra IA (Codex, Gemini CLI...), crie `ia/<nome>.rs` com
//! `INFO` + `uso(token)` e registre em `PROVEDORES` e em `buscar_uso`.

mod antigravity;
mod claude;
mod cofre;

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JanelaUso {
    pub rotulo: String,
    pub utilizacao: Option<f64>,
    /// Epoch em milissegundos.
    pub reseta_em: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvedorInfo {
    pub id: &'static str,
    pub rotulo: &'static str,
    pub rotulo_token: &'static str,
    pub exemplo_token: &'static str,
    pub ajuda: &'static str,
    pub passos: &'static [&'static str],
    /// Provider com login pelo navegador (OAuth) direto no app.
    pub login_navegador: bool,
}

const PROVEDORES: [&ProvedorInfo; 2] = [&claude::INFO, &antigravity::INFO];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conta {
    pub id: String,
    pub provedor: String,
    pub rotulo: String,
    /// Quanto a assinatura custa por mês (ex.: 100 = Claude Max US$ 100).
    pub plano_usd_mensal: Option<f64>,
}

/// O arquivo de contas guarda só metadados; os tokens ficam no cofre do sistema.
static CONTAS: Mutex<()> = Mutex::new(());

fn arquivo_contas(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("contas-ia.json"))
}

fn ler_contas(app: &AppHandle) -> Result<Vec<Conta>, String> {
    let caminho = arquivo_contas(app)?;
    match std::fs::read_to_string(&caminho) {
        Ok(texto) => serde_json::from_str(&texto).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(e.to_string()),
    }
}

fn gravar_contas(app: &AppHandle, contas: &[Conta]) -> Result<(), String> {
    let texto = serde_json::to_string_pretty(contas).map_err(|e| e.to_string())?;
    std::fs::write(arquivo_contas(app)?, texto).map_err(|e| e.to_string())
}

/// Um token vai direto no header Authorization, que só aceita ASCII visível.
/// Validar aqui dá uma mensagem clara em vez de um erro HTTP ilegível depois.
pub fn validar_token(provedor: &str, token: &str) -> Result<(), String> {
    if token.is_empty() {
        return Err("Informe o token.".into());
    }
    if token.chars().any(char::is_whitespace) {
        return Err("O token não pode conter espaços ou quebras de linha.".into());
    }
    if !token.bytes().all(|b| (0x20..=0x7e).contains(&b)) {
        return Err("O token tem caracteres inválidos — copie-o novamente.".into());
    }
    let (info, valido) = match provedor {
        claude::ID => (&claude::INFO, claude::token_valido(token)),
        antigravity::ID => (&antigravity::INFO, antigravity::token_valido(token)),
        outro => return Err(format!("IA desconhecida: {outro}")),
    };
    if !valido {
        return Err(format!("Token inválido para {}. Esperado algo como \"{}\".", info.rotulo, info.exemplo_token));
    }
    Ok(())
}

fn novo_id() -> String {
    use rand::Rng;
    let sufixo: u64 = rand::thread_rng().gen();
    format!("{:x}{:x}", chrono::Utc::now().timestamp_millis(), sufixo)
}

pub(crate) fn salvar(app: &AppHandle, provedor: &str, rotulo: &str, token: &str, plano_usd_mensal: Option<f64>) -> Result<Conta, String> {
    validar_token(provedor, token)?;
    let rotulo = rotulo.trim();
    if rotulo.is_empty() {
        return Err("Dê um nome para a conta (ex.: Pessoal, Agência).".into());
    }

    let _trava = CONTAS.lock().unwrap();
    let mut contas = ler_contas(app)?;
    // Mesmo provider + mesmo nome = reconectar a conta, não duplicar.
    let conta = match contas.iter_mut().find(|c| c.provedor == provedor && c.rotulo.eq_ignore_ascii_case(rotulo)) {
        Some(existente) => {
            existente.plano_usd_mensal = plano_usd_mensal;
            existente.clone()
        }
        None => {
            let conta = Conta { id: novo_id(), provedor: provedor.into(), rotulo: rotulo.into(), plano_usd_mensal };
            contas.push(conta.clone());
            conta
        }
    };
    cofre::salvar(app, &conta.id, token)?;
    gravar_contas(app, &contas)?;
    Ok(conta)
}

#[tauri::command]
pub async fn ia_provedores() -> Vec<ProvedorInfo> {
    PROVEDORES.iter().map(|p| (*p).clone()).collect()
}

#[tauri::command]
pub async fn ia_contas(app: AppHandle) -> Result<Vec<Conta>, String> {
    let _trava = CONTAS.lock().unwrap();
    ler_contas(&app)
}

#[tauri::command]
pub async fn ia_salvar_conta(app: AppHandle, provedor: String, rotulo: String, token: String, plano_usd_mensal: Option<f64>) -> Result<Conta, String> {
    salvar(&app, &provedor, &rotulo, token.trim(), plano_usd_mensal)
}

#[tauri::command]
pub async fn ia_remover_conta(app: AppHandle, id: String) -> Result<(), String> {
    let _trava = CONTAS.lock().unwrap();
    let mut contas = ler_contas(&app)?;
    contas.retain(|c| c.id != id);
    gravar_contas(&app, &contas)?;
    cofre::remover(&app, &id)
}

#[tauri::command]
pub async fn ia_uso(app: AppHandle, id: String) -> Result<Vec<JanelaUso>, String> {
    let conta = {
        let _trava = CONTAS.lock().unwrap();
        ler_contas(&app)?.into_iter().find(|c| c.id == id).ok_or("Conta não encontrada")?
    };
    let token = cofre::ler(&app, &conta.id)?;
    buscar_uso(&conta.provedor, &token).await
}

/// Testa um token antes de salvar, para a tela de configuração avisar na hora.
#[tauri::command]
pub async fn ia_testar_token(provedor: String, token: String) -> Result<Vec<JanelaUso>, String> {
    let token = token.trim();
    validar_token(&provedor, token)?;
    buscar_uso(&provedor, token).await
}

async fn buscar_uso(provedor: &str, token: &str) -> Result<Vec<JanelaUso>, String> {
    let cliente = reqwest::Client::new();
    match provedor {
        claude::ID => claude::uso(&cliente, token).await,
        antigravity::ID => antigravity::uso(&cliente, token).await,
        outro => Err(format!("IA desconhecida: {outro}")),
    }
}

#[tauri::command]
pub async fn ia_login_antigravity(app: AppHandle, rotulo: String, plano_usd_mensal: Option<f64>) -> Result<Conta, String> {
    let refresh_token = antigravity::login_pelo_navegador(&app).await?;
    salvar(&app, antigravity::ID, &rotulo, &refresh_token, plano_usd_mensal)
}
