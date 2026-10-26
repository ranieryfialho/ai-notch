fn main() {
    carregar_segredos();
    tauri_build::build()
}

/// Repassa as credenciais de `.segredos.env` (fora do git) para `option_env!`.
/// Variáveis já definidas no ambiente (ex.: secrets do GitHub Actions) têm
/// prioridade sobre o arquivo.
fn carregar_segredos() {
    const CHAVES: [&str; 2] = ["ANTIGRAVITY_CLIENT_ID", "ANTIGRAVITY_CLIENT_SECRET"];
    println!("cargo:rerun-if-changed=.segredos.env");
    for chave in CHAVES {
        println!("cargo:rerun-if-env-changed={chave}");
    }

    let arquivo = std::fs::read_to_string(".segredos.env").unwrap_or_default();
    for linha in arquivo.lines().map(str::trim).filter(|l| !l.starts_with('#')) {
        let Some((chave, valor)) = linha.split_once('=') else { continue };
        let chave = chave.trim();
        if CHAVES.contains(&chave) && std::env::var_os(chave).is_none() {
            println!("cargo:rustc-env={chave}={}", valor.trim());
        }
    }
}
