#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export CARGO_HOME="${CARGO_HOME:-$ROOT_DIR/.cargo-home}"
export RUSTUP_HOME="${RUSTUP_HOME:-$ROOT_DIR/.rustup-home}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT_DIR/.cargo-target/vercel}"
export PATH="$CARGO_HOME/bin:$PATH"

DX_VERSION="0.6.3"
DX_ROOT="$ROOT_DIR/.vercel-tools/dx"
DX_BIN="$DX_ROOT/bin/dx"

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  export PATH="$CARGO_HOME/bin:$PATH"
fi

rustup target add wasm32-unknown-unknown

if [ ! -x "$DX_BIN" ]; then
  cargo install dioxus-cli --version "$DX_VERSION" --root "$DX_ROOT" --locked
fi

"$DX_BIN" build --release --platform web