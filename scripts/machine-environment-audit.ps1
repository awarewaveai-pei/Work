<#
.SYNOPSIS
  可重複執行的「本機開發環境」稽核：對齊 monorepo、Git、Node（與 CI）、npm 依賴、可選工具與憑證占位（不讀取密鑰內容）。

.DESCRIPTION
  「完美」可操作定義（與 agency-os REMOTE §6 一致，並補 CI Node 版本）：
  - Monorepo 結構正確
  - Git 在 main、建議乾淨、與 origin/main 對齊（可 -FetchOrigin）
  - Node：滿足 lobster engines (>=18)，且建議與 GitHub Actions 相同大版本（目前 22）
  - lobster-factory packages/workflows（及可選 mcp-local-wrappers）已 npm ci
  - 建議：GitHub CLI 已登入、DPAPI vault 與 Cursor mcp.json 存在（雙機各做一次）

.PARAMETER WorkRoot
  Monorepo 根（預設為本腳本上一層目錄）。

.PARAMETER FetchOrigin
  稽核前先執行 git fetch origin（需網路），讓 ahead/behind 判讀較準。

.PARAMETER RunVerifyGates
  通過上述檢查後再執行 verify-build-gates.ps1（較慢，但最接近「可開工」真相）。

.PARAMETER Strict
  將「建議」級別（Node 非 22、gh 未裝、vault 空等）視為失敗，exit 1。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -FetchOrigin

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -RunVerifyGates
#>

param(
    [string]$WorkRoot = "",
    [switch]$FetchOrigin,
    [switch]$RunVerifyGates,
    [switch]$Strict
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Audit {
    param(
        [ValidateSet("OK", "WARN", "FAIL")]
        [string]$Level,
        [string]$Message
    )
    $color = switch ($Level) {
        "OK" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
    }
    Write-Host "[$Level] $Message" -ForegroundColor $color
}

$criticalFail = $false
$warnCount = 0

if (-not $WorkRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
}

Set-Location -LiteralPath $WorkRoot
Write-Host "== machine-environment-audit (WorkRoot=$WorkRoot) ==" -ForegroundColor Cyan

$need = @(
    "agency-os",
    "lobster-factory",
    "scripts\verify-build-gates.ps1"
)
foreach ($rel in $need) {
    $p = Join-Path $WorkRoot $rel
    if (-not (Test-Path -LiteralPath $p)) {
        Write-Audit -Level FAIL -Message "Missing required path: $rel"
        $criticalFail = $true
    }
}
if ($criticalFail) {
    Write-Host "Abort: invalid monorepo root."
    exit 1
}
Write-Audit -Level OK -Message "Monorepo layout (agency-os, lobster-factory, scripts) present."

# --- Git ---
try {
    $null = & git rev-parse --is-inside-work-tree 2>&1
    if ($LASTEXITCODE -ne 0) { throw "not a git repo" }
} catch {
    Write-Audit -Level FAIL -Message "Git: not a repository at $WorkRoot"
    exit 1
}

$branch = (& git branch --show-current 2>&1).Trim()
if ($branch -ne "main") {
    Write-Audit -Level WARN -Message "Git branch is '$branch' (expected main for routine work)."
    $warnCount++
} else {
    Write-Audit -Level OK -Message "Git branch: main"
}

$statusShort = (& git status --porcelain 2>&1)
if ($statusShort) {
    Write-Audit -Level WARN -Message "Working tree is dirty (commit/stash before assuming reproducible env)."
    $warnCount++
} else {
    Write-Audit -Level OK -Message "Git working tree clean."
}

if ($FetchOrigin) {
    Write-Host "Running: git fetch origin ..." -ForegroundColor DarkGray
    & git fetch origin 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Audit -Level WARN -Message "git fetch origin failed (offline or auth?). Skew check may be stale."
        $warnCount++
    }
}

$counts = (& git rev-list --left-right --count HEAD...origin/main 2>&1) -join ""
if ($counts -match '^\s*(\d+)\s+(\d+)\s*$') {
    $ahead = [int]$Matches[1]
    $behind = [int]$Matches[2]
    if ($ahead -eq 0 -and $behind -eq 0) {
        Write-Audit -Level OK -Message "Git vs origin/main: 0 ahead, 0 behind."
    } else {
        Write-Audit -Level WARN -Message "Git vs origin/main: $ahead ahead, $behind behind (pull/push as needed)."
        $warnCount++
    }
} else {
    Write-Audit -Level WARN -Message "Could not parse ahead/behind vs origin/main (run -FetchOrigin or check remote)."
    $warnCount++
}

# --- Node / npm ---
try {
    $nodeV = (& node --version 2>&1).Trim()
} catch {
    $nodeV = ""
}
if (-not $nodeV) {
    Write-Audit -Level FAIL -Message "Node.js not found on PATH."
    $criticalFail = $true
} else {
    Write-Audit -Level OK -Message "node $nodeV"
    if ($nodeV -match '^v(\d+)') {
        $maj = [int]$Matches[1]
        if ($maj -lt 18) {
            Write-Audit -Level FAIL -Message "Node major $maj < 18 (lobster-factory engines)."
            $criticalFail = $true
        } elseif ($maj -lt 22) {
            Write-Audit -Level WARN -Message "CI workflows use Node 22.x; local is major $maj - recommend aligning to reduce drift."
            $warnCount++
        } else {
            Write-Audit -Level OK -Message "Node major aligns with CI target (22+)."
        }
    }
}

try {
    $npmV = (& npm --version 2>&1).Trim()
} catch {
    $npmV = ""
}
if (-not $npmV){
    Write-Audit -Level FAIL -Message "npm not found on PATH."
    $criticalFail = $true
} else {
    Write-Audit -Level OK -Message "npm $npmV"
}

# --- lobster-factory deps ---
# Root package often has no package-lock (validators are plain Node); workflows package has lock + deps.
$lfRoot = Join-Path $WorkRoot "lobster-factory"
$lfRootLock = Join-Path $lfRoot "package-lock.json"
$lfRootNm = Join-Path $lfRoot "node_modules"
if (Test-Path -LiteralPath $lfRootLock) {
    if (-not (Test-Path -LiteralPath $lfRootNm)) {
        Write-Audit -Level FAIL -Message "lobster-factory has package-lock.json but no node_modules - run: cd lobster-factory; npm ci"
        $criticalFail = $true
    } else {
        Write-Audit -Level OK -Message "lobster-factory root node_modules present (lockfile exists)."
    }
} else {
    Write-Audit -Level OK -Message "lobster-factory root has no package-lock.json - bootstrap gates use repo scripts only (OK)."
}

$wfLock = Join-Path $lfRoot "packages\workflows\package-lock.json"
$wfNm = Join-Path $lfRoot "packages\workflows\node_modules"
if (Test-Path -LiteralPath $wfLock) {
    if (-not (Test-Path -LiteralPath $wfNm)) {
        Write-Audit -Level FAIL -Message "lobster-factory\packages\workflows\node_modules missing - run: cd lobster-factory\packages\workflows; npm ci"
        $criticalFail = $true
    } else {
        Write-Audit -Level OK -Message "packages/workflows node_modules present."
    }
} else {
    Write-Audit -Level WARN -Message "packages/workflows has no package-lock.json (unexpected) - skipped."
    $warnCount++
}

$wrapRoot = Join-Path $WorkRoot "mcp-local-wrappers"
if (Test-Path -LiteralPath $wrapRoot) {
    $wNm = Join-Path $wrapRoot "node_modules"
    if (-not (Test-Path -LiteralPath $wNm)) {
        Write-Audit -Level FAIL -Message "mcp-local-wrappers\node_modules missing - run npm ci there."
        $criticalFail = $true
    } else {
        Write-Audit -Level OK -Message "mcp-local-wrappers node_modules present."
    }
} else {
    Write-Audit -Level OK -Message "mcp-local-wrappers not in repo (optional — skipped)."
}

# --- GitHub CLI (recommended) ---
$ghOk = $false
$ghCmd = Get-Command gh -ErrorAction SilentlyContinue
if ($ghCmd) {
    $ghVer = (& gh --version 2>&1 | Select-Object -First 1).ToString().Trim()
    if ($ghVer) {
        Write-Audit -Level OK -Message "gh installed: $ghVer"
        $ghOk = $true
    }
}
if (-not $ghOk) {
    Write-Audit -Level WARN -Message "GitHub CLI (gh) not found - install for Actions/dual machine parity (winget install GitHub.cli)."
    $warnCount++
} else {
    $auth = & gh auth status 2>&1 | Out-String
    if ($auth -match "Logged in") {
        Write-Audit -Level OK -Message "gh auth: logged in."
    } else {
        Write-Audit -Level WARN -Message "gh installed but not logged in - run: gh auth login"
        $warnCount++
    }
}

# --- DPAPI vault (existence + non-empty count, no secret values) ---
$vaultPath = Join-Path $env:LOCALAPPDATA "AgencyOS\secrets\vault.json"
if (-not (Test-Path -LiteralPath $vaultPath)) {
    Write-Audit -Level WARN -Message "DPAPI vault not initialized - see agency-os/docs/operations/local-secrets-vault-dpapi.md (scripts/secrets-vault.ps1)."
    $warnCount++
} else {
    try {
        $raw = Get-Content -LiteralPath $vaultPath -Raw -Encoding UTF8 -ErrorAction Stop
        $j = $raw | ConvertFrom-Json
        $n = 0
        if ($j.secrets) {
            $n = @($j.secrets.PSObject.Properties).Count
        }
        if ($n -gt 0) {
            Write-Audit -Level OK -Message "DPAPI vault exists with $n secret name(s) (values not displayed)."
        } else {
            Write-Audit -Level WARN -Message "DPAPI vault exists but has no secrets - run vault import if scripts need keys."
            $warnCount++
        }
    } catch {
        Write-Audit -Level WARN -Message "DPAPI vault file present but could not parse (fix or re-init vault)."
        $warnCount++
    }
}

# --- Cursor MCP config placeholder ---
$mcpUser = Join-Path $env:USERPROFILE ".cursor\mcp.json"
if (-not (Test-Path -LiteralPath $mcpUser)) {
    Write-Audit -Level WARN -Message "Cursor mcp.json not found at $mcpUser - rebuild per agency-os/docs/operations/mcp-add-server-quickstart.md"
    $warnCount++
} else {
    Write-Audit -Level OK -Message "Cursor mcp.json present (per-user; not audited for contents)."
}

# --- Optional full gate ---
if ($RunVerifyGates -and -not $criticalFail) {
    Write-Host "== Running verify-build-gates.ps1 ==" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -NoProfile -File (Join-Path $WorkRoot "scripts\verify-build-gates.ps1") -WorkRoot $WorkRoot
    if ($LASTEXITCODE -ne 0) {
        Write-Audit -Level FAIL -Message "verify-build-gates failed (exit $LASTEXITCODE)."
        $criticalFail = $true
    }
}

if ($Strict -and $warnCount -gt 0) {
    Write-Audit -Level FAIL -Message "-Strict: treating $warnCount warning(s) as failure."
    exit 1
}

if ($criticalFail) {
    Write-Host "== AUDIT RESULT: FAIL (critical) ==" -ForegroundColor Red
    exit 1
}

if ($warnCount -gt 0) {
    Write-Host "== AUDIT RESULT: PASS with $warnCount warning(s) - see above for perfect parity. ==" -ForegroundColor Yellow
    exit 0
}

Write-Host "== AUDIT RESULT: PASS (no warnings) ==" -ForegroundColor Green
exit 0
