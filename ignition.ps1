[CmdletBinding()]
param(
    [string]$ApiKeysPath = 'E:\Downloads\AI Training\API Keys.txt',
    [string]$TargetDir = 'V:\Ingress\TestBatch',
    [string]$OutputRoot = 'V:\Metadata\Listings',
    [string]$ProductFamily = 'shirt',
    [string]$TitleHint = ''
)

$ErrorActionPreference = 'Stop'

function Fail-Truth {
    param([string]$Message)
    Write-Error $Message
    exit 1
}

function Read-KeyMaterial {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        Fail-Truth "Beautiful Truth: API key anchor missing at $Path"
    }

    $raw = Get-Content -LiteralPath $Path -Raw
    $keys = @{
        XAI_API_KEY    = $null
        OPENAI_API_KEY = $null
        GEMINI_API_KEY = $null
    }

    foreach ($line in ($raw -split '\r?\n')) {
        if ($line -match '^\s*(XAI_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY)\s*[:=]\s*(.+?)\s*$') {
            $keys[$matches[1]] = $matches[2].Trim()
        }
    }

    if (-not $keys.OPENAI_API_KEY) {
        $openAiMatch = [regex]::Match($raw, '(?m)\bsk-[A-Za-z0-9_\-]+\b')
        if ($openAiMatch.Success) {
            $keys.OPENAI_API_KEY = $openAiMatch.Value
        }
    }

    if (-not $keys.XAI_API_KEY) {
        $xaiMatch = [regex]::Match($raw, '(?im)Authorization:\s*Bearer\s+(xai-[A-Za-z0-9]+)')
        if ($xaiMatch.Success) {
            $keys.XAI_API_KEY = $xaiMatch.Groups[1].Value
        }
    }

    if (-not $keys.GEMINI_API_KEY) {
        $geminiMatch = [regex]::Match($raw, '(?m)\bAIza[0-9A-Za-z\-_]+\b')
        if ($geminiMatch.Success) {
            $keys.GEMINI_API_KEY = $geminiMatch.Value
        }
    }

    $missing = @($keys.Keys | Where-Object { [string]::IsNullOrWhiteSpace($keys[$_]) })
    if ($missing.Count -gt 0) {
        Fail-Truth ("Beautiful Truth: API key file is malformed or incomplete. Missing: " + ($missing -join ', '))
    }

    return $keys
}

if (-not (Test-Path -LiteralPath $TargetDir -PathType Container)) {
    Fail-Truth "Beautiful Truth: target ingress directory is missing at $TargetDir"
}

if (-not (Test-Path -LiteralPath 'V:\' -PathType Container)) {
    Fail-Truth 'Beautiful Truth: hardware anchor V:\ is not mounted'
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Fail-Truth 'Beautiful Truth: cargo is not available in this shell'
}

$workspaceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$keys = Read-KeyMaterial -Path $ApiKeysPath
$prior = @{}
$managedNames = @('XAI_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY')

foreach ($name in $managedNames) {
    $prior[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
    foreach ($name in $managedNames) {
        [Environment]::SetEnvironmentVariable($name, $keys[$name], 'Process')
    }

    Push-Location $workspaceRoot
    try {
        $cargoArgs = @(
            '+1.94.0-x86_64-pc-windows-msvc',
            'run',
            '-j', '1',
            '--release',
            '--features', 'desktop micro-cell',
            '--',
            '--swarm-pulsar',
            '--swarm-dir', $TargetDir,
            '--swarm-output-root', $OutputRoot,
            '--umg-provider', 'grok',
            '--forge-product-family', $ProductFamily
        )

        if (-not [string]::IsNullOrWhiteSpace($TitleHint)) {
            $cargoArgs += @('--forge-title', $TitleHint)
        }

        & cargo @cargoArgs
        exit $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}
finally {
    foreach ($name in $managedNames) {
        [Environment]::SetEnvironmentVariable($name, $prior[$name], 'Process')
    }
}
