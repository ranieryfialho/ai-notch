//! Tokens das IAs ficam no cofre do sistema (Gerenciador de Credenciais no
//! Windows, Keychain no macOS, Secret Service/GNOME Keyring no Linux).
//! Distros sem Secret Service caem num arquivo local com permissão 0600.

use std::collections::BTreeMap;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const SERVICO: &str = "dev.rafi.ainotch";

fn arquivo_reserva(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("tokens.json"))
}

fn ler_reserva(app: &AppHandle) -> BTreeMap<String, String> {
    arquivo_reserva(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn gravar_reserva(app: &AppHandle, mapa: &BTreeMap<String, String>) -> Result<(), String> {
    let caminho = arquivo_reserva(app)?;
    std::fs::write(&caminho, serde_json::to_string(mapa).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&caminho, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

pub fn salvar(app: &AppHandle, id: &str, token: &str) -> Result<(), String> {
    let no_cofre = keyring::Entry::new(SERVICO, id).and_then(|e| e.set_password(token));
    let mut reserva = ler_reserva(app);
    match no_cofre {
        Ok(()) => {
            // Se a conta já esteve no arquivo, não deixa a cópia velha lá.
            if reserva.remove(id).is_some() {
                gravar_reserva(app, &reserva)?;
            }
        }
        Err(_) => {
            reserva.insert(id.into(), token.into());
            gravar_reserva(app, &reserva)?;
        }
    }
    Ok(())
}

pub fn ler(app: &AppHandle, id: &str) -> Result<String, String> {
    if let Ok(token) = keyring::Entry::new(SERVICO, id).and_then(|e| e.get_password()) {
        return Ok(token);
    }
    ler_reserva(app)
        .remove(id)
        .ok_or_else(|| "Token desta conta não encontrado — conecte a conta de novo.".into())
}

pub fn remover(app: &AppHandle, id: &str) -> Result<(), String> {
    if let Ok(entrada) = keyring::Entry::new(SERVICO, id) {
        let _ = entrada.delete_credential();
    }
    let mut reserva = ler_reserva(app);
    if reserva.remove(id).is_some() {
        gravar_reserva(app, &reserva)?;
    }
    Ok(())
}
