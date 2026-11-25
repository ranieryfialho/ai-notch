//! Windows e macOS ainda não leem periféricos: nada a observar.

use super::Dispositivo;

pub fn observar(_aviso: impl FnMut(Vec<Dispositivo>)) {}
