#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci --ignore-scripts
[ -x .venv/bin/python ] || npm run setup
exec npm start
