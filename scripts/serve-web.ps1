$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP "quantum_dx_target"
$dx = Join-Path $repo "dx.exe"
if (-not (Test-Path $dx)) {
    throw "dx.exe not found in repo root."
}
& $dx serve --platform web
