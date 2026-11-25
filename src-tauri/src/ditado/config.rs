//! `config.ditado` (salva pelo front em config.json). Na primeira vez, se o
//! Open Whisper já estiver configurado nesta máquina, as escolhas dele
//! (provedor, modelos, atalho, idioma...) são trazidas para cá.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ConfigDitado {
    pub ativo: bool,
    /// "local", "openrouter", "openai" ou "groq".
    pub provedor: String,
    /// Modelo escolhido para cada provedor.
    pub modelos: HashMap<String, String>,
    /// "Segure para falar", em códigos de `teclas.rs`.
    pub atalho: Vec<u32>,
    /// Tocada com o atalho pressionado, trava a gravação (falar sem segurar).
    pub tecla_maos_livres: u32,
    /// "auto" ou código ISO 639-1.
    pub idioma: String,
    pub limpeza: bool,
    pub restaurar_area_transferencia: bool,
    pub sons: bool,
    /// Pausa a música enquanto grava (o Whisper ouviria a música junto) e retoma ao parar de gravar.
    pub pausar_midia: bool,
    /// Nome do microfone; vazio usa o padrão do sistema.
    pub microfone: String,
}

impl Default for ConfigDitado {
    fn default() -> Self {
        ConfigDitado {
            ativo: true,
            provedor: "local".into(),
            modelos: [("local", "small"), ("openrouter", "google/gemini-2.5-flash"), ("openai", "gpt-4o-mini-transcribe"), ("groq", "whisper-large-v3-turbo")]
                .into_iter()
                .map(|(p, m)| (p.to_string(), m.to_string()))
                .collect(),
            // Ctrl + Option no Mac, Ctrl + Super/Win nos outros (como no Open Whisper).
            atalho: if cfg!(target_os = "macos") { vec![29, 56] } else { vec![29, 3675] },
            tecla_maos_livres: 57,
            idioma: "pt".into(),
            limpeza: false,
            restaurar_area_transferencia: true,
            sons: true,
            pausar_midia: true,
            microfone: String::new(),
        }
    }
}

impl ConfigDitado {
    pub fn da_config(config: &Value) -> Self {
        config.get("ditado").and_then(|d| serde_json::from_value(d.clone()).ok()).unwrap_or_default()
    }

    pub fn modelo_atual(&self) -> String {
        self.modelos.get(&self.provedor).cloned().unwrap_or_else(|| ConfigDitado::default().modelos.get(&self.provedor).cloned().unwrap_or_default())
    }
}

/// Lê a config salva; se ainda não houver `ditado`, tenta importar do Open Whisper.
pub fn carregar(app: &AppHandle) -> ConfigDitado {
    let Ok(loja) = app.store("config.json") else { return ConfigDitado::default() };
    let mut config = loja.get("config").unwrap_or_else(|| serde_json::json!({}));
    if config.get("ditado").is_some() {
        return ConfigDitado::da_config(&config);
    }
    let Some(importada) = importar_open_whisper() else { return ConfigDitado::default() };
    if let (Some(objeto), Ok(valor)) = (config.as_object_mut(), serde_json::to_value(&importada)) {
        objeto.insert("ditado".into(), valor);
        loja.set("config", config);
        let _ = loja.save();
    }
    importada
}

fn importar_open_whisper() -> Option<ConfigDitado> {
    let pasta = if cfg!(target_os = "macos") {
        dirs_home()?.join("Library/Application Support/Open Whisper")
    } else if cfg!(windows) {
        std::path::PathBuf::from(std::env::var_os("APPDATA")?).join("Open Whisper")
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(std::path::PathBuf::from).or_else(|| dirs_home().map(|h| h.join(".config")))?.join("Open Whisper")
    };
    let salvo: Value = serde_json::from_str(&std::fs::read_to_string(pasta.join("settings.json")).ok()?).ok()?;
    let mut cfg = ConfigDitado::default();
    let texto = |chave: &str| salvo.get(chave).and_then(Value::as_str).map(String::from);
    let marcado = |chave: &str| salvo.get(chave).and_then(Value::as_bool);
    if let Some(p) = texto("provider") {
        cfg.provedor = p;
    }
    if let Some(modelos) = salvo.get("models").and_then(Value::as_object) {
        for (provedor, modelo) in modelos {
            let Some(modelo) = modelo.as_str() else { continue };
            // Os modelos locais do Open Whisper são ONNX ("onnx-community/whisper-small"); aqui são ggml.
            let modelo = if provedor == "local" { modelo.rsplit("whisper-").next().unwrap_or("small") } else { modelo };
            cfg.modelos.insert(provedor.clone(), modelo.to_string());
        }
    }
    if let Some(atalho) = salvo.get("hotkey").and_then(Value::as_array) {
        let teclas: Vec<u32> = atalho.iter().filter_map(|v| v.as_u64().map(|n| n as u32)).collect();
        if !teclas.is_empty() {
            cfg.atalho = teclas;
        }
    }
    if let Some(tecla) = salvo.get("handsFreeKey").and_then(Value::as_u64) {
        cfg.tecla_maos_livres = tecla as u32;
    }
    if let Some(idioma) = texto("language") {
        cfg.idioma = idioma;
    }
    cfg.limpeza = marcado("cleanup").unwrap_or(cfg.limpeza);
    cfg.restaurar_area_transferencia = marcado("restoreClipboard").unwrap_or(cfg.restaurar_area_transferencia);
    cfg.sons = marcado("sounds").unwrap_or(cfg.sons);
    Some(cfg)
}

fn dirs_home() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(std::path::PathBuf::from)
}
