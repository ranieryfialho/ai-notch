//! Periféricos no macOS pelo `system_profiler SPBluetoothDataType -json`, que
//! lista os acessórios Bluetooth conectados com a carga: Magic Mouse,
//! Keyboard e Trackpad (`device_batteryLevelMain`), AirPods e Beats (esquerdo,
//! direito e estojo) e outros fones e controles que informam bateria.
//!
//! O comando demora cerca de 1 s, então a leitura é a cada minuto, numa thread própria.

// Nos testes do Linux só a leitura do JSON é usada.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use std::process::Command;
use std::time::Duration;

use serde_json::Value;

use super::{Conexao, Dispositivo, Estado, Tipo};

const INTERVALO: Duration = Duration::from_secs(60);

pub fn observar(mut aviso: impl FnMut(Vec<Dispositivo>)) {
    loop {
        aviso(listar());
        std::thread::sleep(INTERVALO);
    }
}

fn listar() -> Vec<Dispositivo> {
    let Ok(saida) = Command::new("/usr/sbin/system_profiler").args(["SPBluetoothDataType", "-json"]).output() else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_slice::<Value>(&saida.stdout) else {
        return Vec::new();
    };
    json.get("SPBluetoothDataType")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|controlador| controlador.get("device_connected")?.as_array())
        .flatten()
        // Cada item é `{ "Nome do aparelho": { ...propriedades } }`.
        .filter_map(|item| item.as_object()?.iter().next())
        .filter_map(|(nome, info)| converter(nome, info))
        .collect()
}

fn converter(nome: &str, info: &Value) -> Option<Dispositivo> {
    let nivel = |chave: &str| -> Option<u8> { info.get(chave)?.as_str()?.trim().trim_end_matches('%').trim().parse().ok() };
    // Fones com dois lados: vale o mais fraco, como no BatteryHub. O estojo só se não houver outro.
    let lados: Vec<u8> = ["device_batteryLevelLeft", "device_batteryLevelRight"].iter().filter_map(|c| nivel(c)).collect();
    let percentual = nivel("device_batteryLevelMain")
        .or_else(|| lados.iter().min().copied())
        .or_else(|| nivel("device_batteryLevel"))
        .or_else(|| nivel("device_batteryLevelCase"))?;

    let tipo_mac = info.get("device_minorType").and_then(Value::as_str).unwrap_or_default().to_lowercase();
    let tipo = if tipo_mac.contains("mouse") || tipo_mac.contains("trackpad") {
        Tipo::Mouse
    } else if tipo_mac.contains("keyboard") {
        Tipo::Teclado
    } else if tipo_mac.contains("headset") {
        Tipo::Headset
    } else if tipo_mac.contains("headphone") || !lados.is_empty() {
        Tipo::Fones
    } else if tipo_mac.contains("gamepad") || tipo_mac.contains("joystick") {
        Tipo::Controle
    } else {
        Tipo::Outro
    };

    let id = info.get("device_address").and_then(Value::as_str).unwrap_or(nome).to_string();
    Some(Dispositivo {
        id,
        nome: nome.to_string(),
        tipo,
        percentual: percentual.min(100),
        // O system_profiler não diz se está carregando.
        estado: Estado::Desconhecido,
        conexao: Conexao::Bluetooth,
    })
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn airpods_usam_o_lado_mais_fraco() {
        let info = serde_json::json!({
            "device_address": "AA:BB",
            "device_minorType": "Headphones",
            "device_batteryLevelLeft": "80%",
            "device_batteryLevelRight": "65%",
            "device_batteryLevelCase": "100%"
        });
        let d = converter("AirPods Pro", &info).unwrap();
        assert_eq!((d.percentual, d.tipo, d.id.as_str()), (65, Tipo::Fones, "AA:BB"));
    }

    #[test]
    fn magic_mouse_e_sem_bateria() {
        let mouse = serde_json::json!({ "device_minorType": "Mouse", "device_batteryLevelMain": "42%" });
        assert_eq!(converter("Magic Mouse", &mouse).unwrap().percentual, 42);
        assert!(converter("Alto-falante", &serde_json::json!({ "device_minorType": "Speaker" })).is_none());
    }
}
