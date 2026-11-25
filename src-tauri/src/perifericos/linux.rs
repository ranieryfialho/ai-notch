//! Periféricos pelo UPower (D-Bus do sistema). Em vez de consultar a cada
//! poucos segundos, assinamos os sinais do UPower (dispositivo entrou/saiu,
//! propriedade mudou) e só relemos a lista quando algo acontece.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use dbus::arg::{prop_cast, PropMap};
use dbus::blocking::stdintf::org_freedesktop_dbus::Properties;
use dbus::blocking::Connection;
use dbus::channel::MatchingReceiver;
use dbus::message::{MatchRule, MessageType};

use super::{Conexao, Dispositivo, Estado, Tipo};

const UPOWER: &str = "org.freedesktop.UPower";
const CAMINHO_UPOWER: &str = "/org/freedesktop/UPower";
const INTERFACE_DISPOSITIVO: &str = "org.freedesktop.UPower.Device";
const TEMPO_CHAMADA: Duration = Duration::from_secs(5);
/// Releitura de segurança: alguns drivers atualizam o nível sem emitir sinal.
const RELEITURA: Duration = Duration::from_secs(120);

/// Roda para sempre; se o D-Bus/UPower cair, tenta reconectar.
pub fn observar(mut aviso: impl FnMut(Vec<Dispositivo>)) {
    loop {
        if let Err(e) = sessao(&mut aviso) {
            eprintln!("periféricos: UPower indisponível ({e}); nova tentativa em 30 s");
        }
        std::thread::sleep(Duration::from_secs(30));
    }
}

fn sessao(aviso: &mut impl FnMut(Vec<Dispositivo>)) -> Result<(), dbus::Error> {
    let conexao = Connection::new_system()?;

    for regra in [
        "type='signal',sender='org.freedesktop.UPower',interface='org.freedesktop.UPower'",
        "type='signal',sender='org.freedesktop.UPower',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged'",
    ] {
        conexao.add_match_no_cb(regra)?;
    }

    // O filtro local aceita qualquer sinal: o barramento já só entrega os que
    // assinamos acima, e entrega com o nome único (:1.x), não "org.freedesktop.UPower",
    // então comparar o remetente aqui descartaria tudo.
    let mudou = Arc::new(AtomicBool::new(true));
    let marcar = mudou.clone();
    let mut sinais = MatchRule::new();
    sinais.msg_type = Some(MessageType::Signal);
    conexao.start_receive(
        sinais,
        Box::new(move |_, _| {
            marcar.store(true, Ordering::Relaxed);
            true
        }),
    );

    let mut ultima_leitura = Instant::now();
    loop {
        if ultima_leitura.elapsed() >= RELEITURA {
            mudou.store(true, Ordering::Relaxed);
        }
        if mudou.swap(false, Ordering::Relaxed) {
            // Conectar um receptor gera uma rajada de sinais; esperamos ela acabar.
            while conexao.process(Duration::from_millis(300))? {}
            mudou.store(false, Ordering::Relaxed);
            aviso(listar(&conexao)?);
            ultima_leitura = Instant::now();
        }
        conexao.process(Duration::from_secs(30))?;
    }
}

fn listar(conexao: &Connection) -> Result<Vec<Dispositivo>, dbus::Error> {
    let upower = conexao.with_proxy(UPOWER, CAMINHO_UPOWER, TEMPO_CHAMADA);
    let (caminhos,): (Vec<dbus::Path<'static>>,) = upower.method_call(UPOWER, "EnumerateDevices", ())?;
    Ok(caminhos
        .into_iter()
        .filter_map(|caminho| {
            let propriedades = conexao.with_proxy(UPOWER, caminho, TEMPO_CHAMADA).get_all(INTERFACE_DISPOSITIVO).ok()?;
            converter(&propriedades)
        })
        .collect())
}

/// Traduz um dispositivo do UPower; `None` para o que não é periférico.
fn converter(p: &PropMap) -> Option<Dispositivo> {
    let tipo_upower = *prop_cast::<u32>(p, "Type")?;
    let fonte_de_energia = prop_cast::<bool>(p, "PowerSupply").copied().unwrap_or(false);
    let presente = prop_cast::<bool>(p, "IsPresent").copied().unwrap_or(true);
    // Bateria do notebook, nobreak, carregador e monitor ficam de fora.
    if fonte_de_energia || !presente || matches!(tipo_upower, 1 | 3 | 4) {
        return None;
    }

    let tipo = match tipo_upower {
        5 => Tipo::Mouse,
        6 => Tipo::Teclado,
        12 => Tipo::Controle,
        13 => Tipo::Caneta,
        17 => Tipo::Headset,
        19 => Tipo::Fones,
        _ => Tipo::Outro,
    };

    let texto = |chave: &str| prop_cast::<String>(p, chave).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let caminho_nativo = texto("NativePath").unwrap_or_default();
    let nome = texto("Model").or_else(|| texto("Vendor")).unwrap_or_else(|| nome_generico(tipo).to_string());

    let conexao = if caminho_nativo.starts_with("/org/bluez") {
        Conexao::Bluetooth
    } else if caminho_nativo.contains("hidpp_battery") {
        Conexao::Receptor
    } else {
        Conexao::Desconhecida
    };

    let estado = match prop_cast::<u32>(p, "State").copied().unwrap_or(0) {
        1 => Estado::Carregando,
        4 => Estado::Cheia,
        2 | 3 | 6 => Estado::Descarregando,
        _ => Estado::Desconhecido,
    };

    let percentual = prop_cast::<f64>(p, "Percentage").copied().unwrap_or(0.0).round().clamp(0.0, 100.0) as u8;

    Some(Dispositivo { id: caminho_nativo, nome, tipo, percentual, estado, conexao })
}

fn nome_generico(tipo: Tipo) -> &'static str {
    match tipo {
        Tipo::Headset => "Headset",
        Tipo::Fones => "Fones",
        Tipo::Mouse => "Mouse",
        Tipo::Teclado => "Teclado",
        Tipo::Controle => "Controle",
        Tipo::Caneta => "Caneta",
        Tipo::Outro => "Dispositivo",
    }
}
