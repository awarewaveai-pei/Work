# Local-only git checkpoint (no push). Intended for the agent to run at milestones;
# the operator does not need to run this by hand unless the environment blocks git.
param(
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [string]$WorkRoot = "",
    [string[]]$Paths = @(),
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($WorkRoot) {
    $WorkRoot = (Resolve-Path $WorkRoot).Path
} elseif ($PSScriptRoot) {
    $WorkRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $WorkRoot = (Get-Location).Path
}

Push-Location $WorkRoot
try {
    $null = git rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Not a git repository: $WorkRoot"
    }

    if ($Paths.Count -eq 0) {
        if ($DryRun) {
            Write-Host "[dry-run] would: git add -A" -ForegroundColor Cyan
        } else {
            git add -A
        }
    } else {
        foreach ($p in $Paths) {
            $full = Join-Path $WorkRoot $p
            if (-not (Test-Path -LiteralPath $full)) {
                throw "Path not found: $p"
            }
            if ($DryRun) {
                Write-Host "[dry-run] would: git add -- $p" -ForegroundColor Cyan
            } else {
                git add -- $p
            }
        }
    }

    if ($DryRun) {
        Write-Host "[dry-run] would: git commit -m <message>" -ForegroundColor Cyan
        exit 0
    }

    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "commit-checkpoint: nothing staged to commit (working tree clean or no changes after add)." -ForegroundColor Yellow
        exit 0
    }

    # Basename `.env` only; common key material (not all possible secrets)
    $blocked = @(
        "[\\/]\.env$",
        "[\\/]id_rsa$",
        "[\\/]id_ed25519$",
        "\.pem$",
        "\.p12$",
        "recovery-codes",
        "\.key$"
    )
    $staged = @(git diff --cached --name-only)
    foreach ($f in $staged) {
        foreach ($pat in $blocked) {
            if ($f -match $pat) {
                throw "Refusing commit: staged path looks sensitive: $f (adjust staging or use .gitignore)"
            }
        }
    }

    git commit -m $Message
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    Write-Host "commit-checkpoint: local commit created (not pushed)." -ForegroundColor Green
    exit 0
} finally {
    Pop-Location
}
