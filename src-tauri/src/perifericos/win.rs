//! Periféricos no Windows, das duas fontes que o próprio sistema já mantém:
//! - Bluetooth: a carga que aparece em Configurações → Bluetooth fica na
//!   propriedade `{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2` do aparelho; lemos
//!   pela SetupAPI em todos os dispositivos presentes.
//! - Controles Xbox (cabo, adaptador ou Bluetooth): Windows.Gaming.Input.
//!
//! Receptores proprietários (Logitech Unifying/Bolt, headsets 2,4 GHz) falam
//! protocolos próprios por HID e ficam para uma etapa futura.

use std::collections::HashSet;
use std::time::Duration;

use windows::core::{GUID, PCWSTR};
use windows::Gaming::Input::{Gamepad, RawGameController};
use windows::System::Power::BatteryStatus;
use windows::Win32::Devices::DeviceAndDriverInstallation::{
    SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW, SetupDiGetDevicePropertyW, DIGCF_ALLCLASSES, DIGCF_PRESENT, HDEVINFO,
    SP_DEVINFO_DATA,
};
use windows::Win32::Devices::Properties::{DEVPKEY_Device_ContainerId, DEVPKEY_Device_DeviceDesc, DEVPKEY_Device_FriendlyName, DEVPROPKEY, DEVPROPTYPE};
use windows::Win32::Foundation::HWND;

use super::{tipo_pelo_nome, Conexao, Dispositivo, Estado, Tipo};

const INTERVALO: Duration = Duration::from_secs(60);

/// Nível de bateria de aparelhos Bluetooth (o mesmo das Configurações do Windows).
const BATERIA_BLUETOOTH: DEVPROPKEY = DEVPROPKEY { fmtid: GUID::from_u128(0x104EA319_6EE2_4701_BD47_8DDBF425BBE5), pid: 2 };

pub fn observar(mut aviso: impl FnMut(Vec<Dispositivo>)) {
    loop {
        let mut lista = bluetooth();
        lista.extend(controles_xbox());
        aviso(lista);
        std::thread::sleep(INTERVALO);
    }
}

/// Lista de dispositivos da SetupAPI, destruída ao sair de escopo.
struct Conjunto(HDEVINFO);

impl Drop for Conjunto {
    fn drop(&mut self) {
        unsafe {
            let _ = SetupDiDestroyDeviceInfoList(self.0);
        }
    }
}

fn bluetooth() -> Vec<Dispositivo> {
    let Ok(conjunto) = (unsafe { SetupDiGetClassDevsW(None, PCWSTR::null(), HWND::default(), DIGCF_ALLCLASSES | DIGCF_PRESENT) }) else {
        return Vec::new();
    };
    let conjunto = Conjunto(conjunto);
    let mut lista = Vec::new();
    // Um fone Bluetooth tem vários nós (áudio, mãos-livres...) com a mesma
    // carga: o ContainerId é o aparelho físico, então fica um só.
    let mut vistos = HashSet::new();

    for indice in 0.. {
        let mut info = SP_DEVINFO_DATA { cbSize: size_of::<SP_DEVINFO_DATA>() as u32, ..Default::default() };
        if unsafe { SetupDiEnumDeviceInfo(conjunto.0, indice, &mut info) }.is_err() {
            break;
        }
        let Some(&[percentual]) = propriedade(&conjunto, &info, &BATERIA_BLUETOOTH).as_deref() else { continue };
        let container = propriedade(&conjunto, &info, &DEVPKEY_Device_ContainerId).unwrap_or_default();
        if !container.is_empty() && !vistos.insert(container.clone()) {
            continue;
        }
        let Some(nome) = texto(&conjunto, &info, &DEVPKEY_Device_FriendlyName).or_else(|| texto(&conjunto, &info, &DEVPKEY_Device_DeviceDesc)) else {
            continue;
        };
        let id = if container.is_empty() { nome.clone() } else { container.iter().map(|b| format!("{b:02x}")).collect() };
        lista.push(Dispositivo {
            id: format!("bt-{id}"),
            tipo: tipo_pelo_nome(&nome),
            nome,
            percentual: percentual.min(100),
            // O Windows não diz se está carregando.
            estado: Estado::Desconhecido,
            conexao: Conexao::Bluetooth,
        });
    }
    lista
}

/// Bytes crus de uma propriedade do dispositivo (`None` se ele não tem).
fn propriedade(conjunto: &Conjunto, info: &SP_DEVINFO_DATA, chave: &DEVPROPKEY) -> Option<Vec<u8>> {
    let mut tipo = DEVPROPTYPE::default();
    let mut tamanho = 0u32;
    // Primeira chamada só para saber o tamanho (falha com "buffer insuficiente").
    let _ = unsafe { SetupDiGetDevicePropertyW(conjunto.0, info, chave, &mut tipo, None, Some(&mut tamanho), 0) };
    if tamanho == 0 {
        return None;
    }
    let mut dados = vec![0u8; tamanho as usize];
    unsafe { SetupDiGetDevicePropertyW(conjunto.0, info, chave, &mut tipo, Some(&mut dados), None, 0) }.ok()?;
    Some(dados)
}

/// Propriedade de texto (UTF-16 terminada em zero).
fn texto(conjunto: &Conjunto, info: &SP_DEVINFO_DATA, chave: &DEVPROPKEY) -> Option<String> {
    let bytes = propriedade(conjunto, info, chave)?;
    let unidades: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|&u| u != 0).collect();
    let texto = String::from_utf16_lossy(&unidades).trim().to_string();
    (!texto.is_empty()).then_some(texto)
}

fn controles_xbox() -> Vec<Dispositivo> {
    let Ok(controles) = Gamepad::Gamepads() else { return Vec::new() };
    let mut lista = Vec::new();
    for (i, controle) in controles.into_iter().enumerate() {
        let Ok(relatorio) = controle.TryGetBatteryReport() else { continue };
        let restante = relatorio.RemainingCapacityInMilliwattHours().and_then(|v| v.Value());
        let total = relatorio.FullChargeCapacityInMilliwattHours().and_then(|v| v.Value());
        // Controle com fio (sem bateria) não informa capacidade.
        let (Ok(restante), Ok(total)) = (restante, total) else { continue };
        if total <= 0 {
            continue;
        }
        let estado = match relatorio.Status() {
            Ok(BatteryStatus::Charging) => Estado::Carregando,
            Ok(BatteryStatus::Idle) => Estado::Cheia,
            Ok(BatteryStatus::Discharging) => Estado::Descarregando,
            _ => Estado::Desconhecido,
        };
        let nome = RawGameController::FromGameController(&controle)
            .and_then(|c| c.DisplayName())
            .map(|n| n.to_string())
            .ok()
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "Controle Xbox".into());
        lista.push(Dispositivo {
            id: format!("xbox-{i}"),
            nome,
            tipo: Tipo::Controle,
            percentual: ((restante as f64 / total as f64) * 100.0).round().clamp(0.0, 100.0) as u8,
            estado,
            conexao: Conexao::Desconhecida,
        });
    }
    lista
}
