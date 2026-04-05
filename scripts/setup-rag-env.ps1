# Creates D:\Work\.env.local for RAG embedding.
# Run from repo root: npm run rag:setup
#
# Windows Terminal: Ctrl+V often types ^V instead of pasting. Secrets are read from
# Clipboard (copy in browser, Enter here) or from a one-line .txt file.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root '.env.local'

function Normalize-SecretLine {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return '' }
  $t = $Text.Trim().Trim('"').Trim("'")
  $t = $t -replace "`r`n", '' -replace "`n", '' -replace "`r", ''
  return $t.Trim()
}

function Get-ClipboardText {
  # Windows PowerShell 5.1 + PowerShell 7
  try {
    $c = Get-Clipboard -ErrorAction Stop
    if ($null -eq $c) { return '' }
    if ($c -is [string]) { return $c }
    if ($c -is [System.Collections.IEnumerable] -and $c -isnot [string]) {
      return ($c -join '')
    }
    return [string]$c
  } catch {
    return ''
  }
}

function Read-SecretClipboardOrFile {
  param(
    [string]$Name,
    [int]$MinLen
  )
  Write-Host ''
  Write-Host "--- $Name ---" -ForegroundColor Yellow
  Write-Host 'Step A: In the browser, select and COPY the full secret (Ctrl+C there).' -ForegroundColor Cyan
  Write-Host 'Step B: Click this terminal window. Do NOT use Ctrl+V here.' -ForegroundColor Cyan
  Write-Host 'Step C: Press Enter below so the script reads from Windows Clipboard.' -ForegroundColor Cyan
  $null = Read-Host 'Press Enter after copying to clipboard'

  $val = Normalize-SecretLine (Get-ClipboardText)
  Write-Host "From clipboard: $($val.Length) characters (need at least $MinLen)." -ForegroundColor DarkGreen

  if ($val.Length -lt $MinLen -or $val -eq '^V') {
    Write-Host 'Clipboard empty, too short, or wrong. Use a .txt file instead.' -ForegroundColor Red
    Write-Host 'Create a file with ONLY the secret on one line (e.g. D:\Work\secret-svc.txt).' -ForegroundColor Gray
    $path = Read-Host 'Full path to that .txt file'
    if ([string]::IsNullOrWhiteSpace($path)) {
      Write-Error 'No file path given. Aborted.'
    }
    $path = $path.Trim().Trim('"')
    if (-not (Test-Path -LiteralPath $path)) {
      Write-Error "File not found: $path"
    }
    $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $val = Normalize-SecretLine $raw
    Write-Host "From file: $($val.Length) characters." -ForegroundColor DarkGreen
  }

  if ($val.Length -lt $MinLen) {
    Write-Error "$Name is only $($val.Length) characters. Copy the full value. Or edit .env.local in Cursor. Aborted."
  }
  return $val
}

Write-Host ''
Write-Host '=== RAG / Supabase env setup ===' -ForegroundColor Cyan
Write-Host ''

# --- URL ---
$url = $null
for ($i = 1; $i -le 12; $i++) {
  Write-Host '1) SUPABASE_URL = API base (Kong), NOT Studio (not :3000).' -ForegroundColor Yellow
  Write-Host '   Type by hand or RIGHT-CLICK paste. Do not use Ctrl+V (becomes ^V).' -ForegroundColor Gray
  $line = Read-Host 'SUPABASE_URL [Enter = http://127.0.0.1:8000]'
  if ([string]::IsNullOrWhiteSpace($line)) {
    $line = 'http://127.0.0.1:8000'
  }
  $line = $line.Trim()
  if ($line -eq '^V') {
    Write-Host 'That was ^V. Type the URL or right-click paste.' -ForegroundColor Red
    continue
  }
  if ($line -match '^https?://\S+' -and $line.Length -ge 12) {
    $url = $line
    break
  }
  Write-Host 'Invalid. Must start with http:// or https://' -ForegroundColor Red
}
if ($null -eq $url) {
  Write-Error 'Could not get SUPABASE_URL. Aborted.'
}

Write-Host ''
Write-Host '2) SUPABASE_SERVICE_ROLE_KEY' -ForegroundColor Yellow
Write-Host '   Studio: Project Settings - API - service_role (Reveal, then copy).' -ForegroundColor Gray
$serviceKey = Read-SecretClipboardOrFile -Name 'service_role' -MinLen 40

Write-Host ''
Write-Host '3) OPENAI_API_KEY' -ForegroundColor Yellow
Write-Host '   https://platform.openai.com/api-keys' -ForegroundColor Gray
$openaiKey = Read-SecretClipboardOrFile -Name 'OpenAI API key' -MinLen 20
if ($openaiKey -notmatch '^sk-') {
  Write-Host 'Warning: OpenAI keys usually start with sk-' -ForegroundColor Yellow
}

Write-Host ''
$model = Read-Host '4) EMBEDDING_MODEL [Enter = text-embedding-3-small]'
if ([string]::IsNullOrWhiteSpace($model)) {
  $model = 'text-embedding-3-small'
}
$model = $model.Trim()

$lines = @(
  "SUPABASE_URL=$url",
  "SUPABASE_SERVICE_ROLE_KEY=$serviceKey",
  "OPENAI_API_KEY=$openaiKey",
  "EMBEDDING_MODEL=$model"
)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($envPath, $lines, $utf8NoBom)

Write-Host ''
Write-Host "Wrote: $envPath" -ForegroundColor Green
Write-Host 'Next: npm run rag:embed' -ForegroundColor Green
Write-Host ''
