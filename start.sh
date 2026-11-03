#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci --ignore-scripts
exec npm start
