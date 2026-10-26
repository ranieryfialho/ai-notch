//! Prateleira de arquivos: o notch guarda só referências (caminhos), como uma
//! área de transferência visual. Nada é copiado nem movido.

use std::path::Path;

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

const ICONE_ARRASTO: &[u8] = include_bytes!("../icons/64x64.png");

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoArquivo {
    pub caminho: String,
    pub nome: String,
    pub existe: bool,
    pub pasta: bool,
    pub tamanho: u64,
}

#[tauri::command]
pub async fn prateleira_info(caminhos: Vec<String>) -> Vec<InfoArquivo> {
    caminhos
        .into_iter()
        .map(|caminho| {
            let p = Path::new(&caminho);
            let meta = std::fs::metadata(p).ok();
            InfoArquivo {
                nome: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| caminho.clone()),
                existe: meta.is_some(),
                pasta: meta.as_ref().is_some_and(|m| m.is_dir()),
                tamanho: meta.map(|m| m.len()).unwrap_or(0),
                caminho,
            }
        })
        .collect()
}

#[tauri::command]
pub async fn abrir_arquivo(app: AppHandle, caminho: String) -> Result<(), String> {
    app.opener().open_path(caminho, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn revelar_arquivo(app: AppHandle, caminho: String) -> Result<(), String> {
    app.opener().reveal_item_in_dir(caminho).map_err(|e| e.to_string())
}

/// O plugin de arrastar pede uma imagem em disco para a prévia; gravamos o
/// ícone embutido no cache uma vez e devolvemos o caminho.
#[tauri::command]
pub async fn icone_arrasto(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let caminho = dir.join("icone-arrasto.png");
    if !caminho.exists() {
        std::fs::write(&caminho, ICONE_ARRASTO).map_err(|e| e.to_string())?;
    }
    Ok(caminho.to_string_lossy().into_owned())
}
