#!/usr/bin/env bash
# Install mods/specd into Herdr's mods folder.
# A symlink is what we'd like (saves would hot-reload), but Herdr's watcher doesn't see changes made
# through a symlinked mod folder (checked 2026-11-25: an open tab never updated after a save), so this
# copies and says so. Re-run `npm run link` after editing mods/specd to update the installed copy.
set -euo pipefail
src="$(cd "$(dirname "$0")/.." && pwd)/mods/specd"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
dest="$home/mods/specd"
mkdir -p "$home/mods"
if [ -L "$dest" ]; then rm "$dest"; else rm -rf "$dest"; fi
cp -R "$src" "$dest"
echo "copied $src -> $dest"
echo "note: not symlinked, because Herdr doesn't hot-reload a symlinked mod; re-run 'npm run link' after edits"
