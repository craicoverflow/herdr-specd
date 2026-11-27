#!/usr/bin/env bash
# Install this repo's layouts and mods into Herdr's folders, or remove what it installed.
#   link.sh            copy every layouts/* and mods/* into $HERDR_APP_HOME (default ~/.config/herdr-app)
#   link.sh --remove   delete only what this repo installs: layouts/specd.json, layouts/specd.svg,
#                      mods/specd and mods/pane-specd (if present). Nothing else is touched.
# A symlink is what we'd like (saves would hot-reload), but Herdr's watcher doesn't see changes made
# through a symlinked mod folder (checked 2026-11-25: an open tab never updated after a save), so this
# copies and says so. Re-run `npm run link` after editing to update the installed copy.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

if [ "${1:-}" = "--remove" ]; then
  for p in layouts/specd.json layouts/specd.svg mods/specd mods/pane-specd; do
    if [ -e "$home/$p" ] || [ -L "$home/$p" ]; then rm -rf "${home:?}/$p"; echo "removed $home/$p"; fi
  done
  exit 0
fi

mkdir -p "$home/layouts" "$home/mods"
for f in "$root"/layouts/*; do
  [ -e "$f" ] || continue
  cp "$f" "$home/layouts/$(basename "$f")"
  echo "copied $f -> $home/layouts/$(basename "$f")"
done
for d in "$root"/mods/*; do
  [ -d "$d" ] || continue
  dest="$home/mods/$(basename "$d")"
  if [ -L "$dest" ]; then rm "$dest"; else rm -rf "$dest"; fi
  cp -R "$d" "$dest"
  echo "copied $d -> $dest"
done
echo "note: not symlinked, because Herdr doesn't hot-reload a symlinked mod; re-run 'npm run link' after edits"
