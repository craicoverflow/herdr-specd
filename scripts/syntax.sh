#!/bin/sh
# Syntax-check every mod and script JS file with node (mods use ES modules, so --check on .mjs copies).
set -eu
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
n=0
find mods test \( -name '*.js' -o -name '*.mjs' \) | grep -v node_modules > "$tmp/list"
while IFS= read -r f; do
  cp "$f" "$tmp/check.mjs"
  node --check "$tmp/check.mjs" || { echo "syntax error in $f" >&2; exit 1; }
  n=$((n + 1))
done < "$tmp/list"
for j in $(find mods -name '*.json'); do node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$j"; done
echo "syntax ok ($n js files)"
