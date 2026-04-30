#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/build-output"

cd "$ROOT_DIR"

if [[ -f "$ROOT_DIR/frontend/package.json" ]]; then
  pushd "$ROOT_DIR/frontend" >/dev/null
  npm install
  npm run build
  popd >/dev/null
fi

python -m pip install --upgrade pip
python -m pip install pyinstaller -r requirements.txt

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

pyinstaller --distpath "$OUTPUT_DIR" --workpath "$ROOT_DIR/build/.pyinstaller-teacher" build/build_teacher.spec
pyinstaller --distpath "$OUTPUT_DIR" --workpath "$ROOT_DIR/build/.pyinstaller-student" build/build_student.spec

echo "Artifacts:"
ls -la "$OUTPUT_DIR"
