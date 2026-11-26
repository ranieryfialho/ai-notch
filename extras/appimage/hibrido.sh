#!/usr/bin/env bash
# Transforma o AppImage gerado pelo Tauri em híbrido (altera o próprio arquivo):
# ele passa a usar o WebKitGTK e o GTK do sistema quando existem e só recorre
# aos embutidos quando faltam. Os embutidos (do Ubuntu 22.04) deixam rastros na
# janela transparente em alguns sistemas (visto no Bazzite com KDE e NVIDIA).
# Precisa de squashfs-tools.
#
# Uso: bash extras/appimage/hibrido.sh caminho/do/arquivo.AppImage
set -euo pipefail

[ $# -eq 1 ] || { echo "uso: $0 arquivo.AppImage" >&2; exit 2; }
appimage="$(readlink -f "$1")"
apprun="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/AppRun"
trabalho="$(mktemp -d)"
trap 'rm -rf "$trabalho"' EXIT

chmod +x "$appimage"
inicio="$("$appimage" --appimage-offset)"
(cd "$trabalho" && "$appimage" --appimage-extract >/dev/null)
dir="$trabalho/squashfs-root"

if [ -e "$dir/AppRun.embutido" ]; then
    echo "$appimage já é híbrido" >&2
    exit 1
fi

mv "$dir/AppRun" "$dir/AppRun.embutido"
install -m 755 "$apprun" "$dir/AppRun"
# Cópia do binário num lugar sem "../lib": o RUNPATH $ORIGIN/../lib não acha as
# bibliotecas embutidas e o carregador usa as do sistema.
install -D -m 755 "$dir/usr/bin/ai-notch" "$dir/usr/sistema/bin/ai-notch"
chmod -R a+rX "$dir"

# Mantém o mesmo runtime (o começo do arquivo) e troca só o conteúdo.
head -c "$inicio" "$appimage" > "$trabalho/novo.AppImage"
mksquashfs "$dir" "$trabalho/conteudo.squashfs" -comp zstd -root-owned -noappend -quiet -no-progress
cat "$trabalho/conteudo.squashfs" >> "$trabalho/novo.AppImage"
install -m 755 "$trabalho/novo.AppImage" "$appimage"

AINOTCH_DIAGNOSTICO=1 "$appimage"
echo "AppImage híbrido pronto: $appimage"
