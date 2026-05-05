#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT_DIR/.cargo-target/vercel}"

WASM_BINDGEN_VERSION="0.2.120"
WBG_ROOT="$ROOT_DIR/.vercel-tools/wasm-bindgen"
WBG_BIN="$WBG_ROOT/bin/wasm-bindgen"

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  export PATH="$HOME/.cargo/bin:$PATH"
fi

if ! rustup show active-toolchain >/dev/null 2>&1; then
  rustup toolchain install stable --profile minimal
  rustup default stable
fi

rustup target add wasm32-unknown-unknown

if [ ! -x "$WBG_BIN" ]; then
  cargo install wasm-bindgen-cli --version "$WASM_BINDGEN_VERSION" --root "$WBG_ROOT" --locked
fi

cargo build --release --target wasm32-unknown-unknown --no-default-features --features web -j 1

rm -rf dist
mkdir -p dist

"$WBG_BIN" \
  --target web \
  --no-typescript \
  --out-dir dist \
  "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/quantum_core.wasm"

cat > dist/index.html <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ContextQuantum</title>
    <meta name="color-scheme" content="dark" />
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #0b0f19;
      }
    </style>
  </head>
  <body>
    <script type="module">
      import init from "./quantum_core.js";
      init();
    </script>
  </body>
</html>
EOF

if [ -d assets ]; then
  mkdir -p dist/assets
  cp -R assets/. dist/assets/
fi



