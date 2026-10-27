#!/usr/bin/env bash
# Renders the demo buyers' photos to public/demo/photos with headless Edge (Windows, Git Bash).
# Usage: bash src/server/demo/photos-src/render.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
out="$here/../../../../public/demo/photos"
profile="${TMPDIR:-/tmp}/truce-edge-profile"
edge="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
mkdir -p "$out"
export MSYS_NO_PATHCONV=1
for name in amber-glow-ruler ember-mug-cracked; do
  "$edge" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --user-data-dir="$profile" --window-size=1200,900 --default-background-color=00000000 \
    --screenshot="$out/$name.png" "file:///$here/$name.html"
done
