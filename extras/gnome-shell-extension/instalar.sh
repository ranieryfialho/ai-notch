#!/usr/bin/env bash
# Instala (ou atualiza) a extensão "AI Notch na barra" para o usuário atual.
# No Wayland, o GNOME só carrega extensões novas depois de sair e entrar de
# novo na sessão; atualizações de uma já carregada também pedem isso.
set -euo pipefail

UUID="ai-notch@ranieryfialho.github.io"
ORIGEM="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$UUID"
DESTINO="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

mkdir -p "$DESTINO"
cp "$ORIGEM"/metadata.json "$ORIGEM"/extension.js "$ORIGEM"/stylesheet.css "$DESTINO"/
echo "Extensão copiada para $DESTINO"

if gnome-extensions enable "$UUID" 2>/dev/null; then
  echo "Extensão ativada."
else
  echo "Saia e entre de novo na sessão; depois rode: gnome-extensions enable $UUID"
fi
