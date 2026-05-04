#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export CARGO_HOME="${CARGO_HOME:-$ROOT_DIR/.cargo-home}"
export RUSTUP_HOME="${RUSTUP_HOME:-$ROOT_DIR/.rustup-home}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT_DIR/.cargo-target/vercel}"
export PATH="$CARGO_HOME/bin:$PATH"

DX_VERSION="0.6.3"
DX_DIR="$ROOT_DIR/.vercel-tools/dx"
DX_BIN="$DX_DIR/dx"
DX_URL="https://github.com/DioxusLabs/dioxus/releases/download/v${DX_VERSION}/dx-x86_64-unknown-linux-gnu-v${DX_VERSION}.tar.gz"

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  export PATH="$CARGO_HOME/bin:$PATH"
fi

rustup target add wasm32-unknown-unknown

if [ ! -x "$DX_BIN" ]; then
  mkdir -p "$DX_DIR"
  curl -fsSL "$DX_URL" | tar -xz -C "$DX_DIR"
fi

"$DX_BIN" build --release --platform web