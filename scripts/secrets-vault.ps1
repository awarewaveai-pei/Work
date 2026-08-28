param(
    [ValidateSet("init", "set", "set-prompt", "get", "list", "remove", "run", "import-mcp", "import-user-env", "sync-copilot-mcp-env", "sync-mcp-user-env", "sync-cursor-mcp-user-env")]
    [string]$Action = "list",
    [string]$Name = "",
    [string]$Value = "",
    [string]$Note = "",
    [string[]]$Names = @(),
    [string]$Command = "",
    [string]$StorePath = "",
    [string]$McpPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-StorePath {
    param([string]$Custom)
    if ($Custom) { return $Custom }
    return (Join-Path $env:LOCALAPPDATA "AgencyOS\secrets\vault.json")
}

function Ensure-Store {
    param([string]$Path)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    if (-not (Test-Path -LiteralPath $Path)) {
        $initial = @{
            version = 1
            updated_at = (Get-Date).ToString("o")
            secrets = @{}
        }
        $initial | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Path -Encoding UTF8
    }
}

function Read-Store {
    param([string]$Path)
    Ensure-Store -Path $Path
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    if (-not $raw.Trim()) {
        return @{
            version = 1
            updated_at = (Get-Date).ToString("o")
            secrets = @{}
        }
    }
    $obj = $raw | ConvertFrom-Json
    if (-not $obj.PSObject.Properties.Name.Contains("secrets") -or -not $obj.secrets) {
        $obj | Add-Member -NotePropertyName "secrets" -NotePropertyValue (@{}) -Force
    } elseif (-not ($obj.secrets -is [System.Collections.IDictionary])) {
        $map = @{}
        foreach ($p in $obj.secrets.PSObject.Properties) {
            $map[$p.Name] = $p.Value
        }
        $obj.secrets = $map
    }
    return $obj
}

function Write-Store {
    param(
        [string]$Path,
        [object]$Store
    )
    $Store.updated_at = (Get-Date).ToString("o")
    $Store | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Protect-Secret {
    param([string]$PlainText)
    $secure = ConvertTo-SecureString -String $PlainText -AsPlainText -Force
    return (ConvertFrom-SecureString -SecureString $secure)
}

function Unprotect-Secret {
    param([string]$CipherText)
    $secure = ConvertTo-SecureString -String $CipherText
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Mask-Value {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return "" }
    if ($Text.Length -le 8) { return ("*" * $Text.Length) }
    return ($Text.Substring(0, 4) + ("*" * ($Text.Length - 6)) + $Text.Substring($Text.Length - 2, 2))
}

function Set-SecretEntry {
    param(
        [object]$Store,
        [string]$SecretName,
        [string]$SecretValue,
        [string]$SecretNote = ""
    )
    if (-not $SecretName) { return }
    if (-not $SecretValue) { return }
    $cipher = Protect-Secret -PlainText $SecretValue
    $Store.secrets[$SecretName] = @{
        cipher = $cipher
        note = $SecretNote
        updated_at = (Get-Date).ToString("o")
    }
}

$resolvedPath = Resolve-StorePath -Custom $StorePath
$store = Read-Store -Path $resolvedPath

switch ($Action) {
    "init" {
        Write-Host "Secrets vault ready: $resolvedPath" -ForegroundColor Green
        exit 0
    }

    "set" {
        if (-not $Name) { throw "Missing -Name for Action=set" }
        if (-not $Value) { throw "Missing -Value for Action=set" }
        Set-SecretEntry -Store $store -SecretName $Name -SecretValue $Value -SecretNote $Note
        Write-Store -Path $resolvedPath -Store $store
        Write-Host "Saved secret: $Name" -ForegroundColor Green
        exit 0
    }

    "set-prompt" {
        if (-not $Name) { throw "Missing -Name for Action=set-prompt" }
        $secureInput = Read-Host -Prompt "Enter secret value for $Name" -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureInput)
        try {
            $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
        if (-not $plain) { throw "Empty value is not allowed" }
        Set-SecretEntry -Store $store -SecretName $Name -SecretValue $plain -SecretNote $Note
        Write-Store -Path $resolvedPath -Store $store
        Write-Host "Saved secret: $Name" -ForegroundColor Green
        exit 0
    }

    "get" {
        if (-not $Name) { throw "Missing -Name for Action=get" }
        if (-not $store.secrets.Contains($Name)) { throw "Secret not found: $Name" }
        $plain = Unprotect-Secret -CipherText $store.secrets[$Name].cipher
        $masked = Mask-Value -Text $plain
        Write-Output "$Name=$masked"
        # Say it out loud. Callers have repeatedly treated this masked line as the
        # real value: ao-resume.ps1 / phase4-weekly-check.ps1 posted it to the
        # Telegram API (silent 404 for weeks) and setup-command-plane.ps1 wrote it
        # back into the vault, destroying the stored secret. The hint goes to the
        # information stream so `... | Select-String '='` style parsing is unaffected.
        Write-Information "  NOTE: value above is MASKED (confirm-only). Real values are consumed from mcp/user-env.ps1 or the environment - never from this command." -InformationAction Continue
        exit 0
    }

    "list" {
        $keys = @($store.secrets.Keys | Sort-Object)
        if ($keys.Count -eq 0) {
            Write-Output "No secrets in vault."
            exit 0
        }
        foreach ($k in $keys) {
            $entry = $store.secrets[$k]
            $ts = ""
            if ($entry.PSObject.Properties.Name.Contains("updated_at")) {
                $ts = [string]$entry.updated_at
            }
            Write-Output ("{0}  updated_at={1}" -f $k, $ts)
        }
        exit 0
    }

    "remove" {
        if (-not $Name) { throw "Missing -Name for Action=remove" }
        if (-not $store.secrets.Contains($Name)) {
            Write-Host "Secret not found: $Name" -ForegroundColor Yellow
            exit 0
        }
        $store.secrets.Remove($Name)
        Write-Store -Path $resolvedPath -Store $store
        Write-Host "Removed secret: $Name" -ForegroundColor Green
        exit 0
    }

    "run" {
        if (-not $Command) { throw "Missing -Command for Action=run" }
        if ($Names.Count -eq 0) { throw "Missing -Names for Action=run" }
        foreach ($n in $Names) {
            if (-not $store.secrets.Contains($n)) {
                if ($n -eq "TRIGGER_ACCESS_TOKEN") {
                    throw @"
Secret not found: TRIGGER_ACCESS_TOKEN

Trigger MCP reads the token only from the local vault (not from mcp.json by default).
From monorepo root, after copying your Trigger.dev Personal Access Token from the dashboard:

  .\scripts\secrets-vault.ps1 -Action set -Name TRIGGER_ACCESS_TOKEN -Value '<paste token here>'

Then reload Cursor. See agency-os/docs/operations/mcp-add-server-quickstart.md (Trigger self-host + TRIGGER_API_URL).
"@
                }
                throw "Secret not found: $n"
            }
            $plain = Unprotect-Secret -CipherText $store.secrets[$n].cipher
            Set-Item -Path ("Env:{0}" -f $n) -Value $plain
        }
        Invoke-Expression $Command
        $lastExit = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
        if ($lastExit) {
            exit ([int]$lastExit.Value)
        }
        exit 0
    }

    "import-mcp" {
        if ([string]::IsNullOrWhiteSpace($McpPath)) {
            # Until 2026-08-28 this preferred .cursor\mcp.json then ~\.cursor\mcp.json. Cursor was
            # retired 2026-08-26 and both are gone, so only the repo-root fallback is left.
            # Deliberately NOT defaulted to %APPDATA%\Claude\claude_desktop_config.json even though
            # that is now the one MCP config still holding plaintext values: importing it would
            # overwrite good vault entries with whatever vintage that file happens to carry.
            # Point -McpPath at it explicitly when that is what you mean.
            $repoRoot = Split-Path $PSScriptRoot -Parent
            $McpPath = Join-Path $repoRoot "mcp.json"
        }
        if (-not (Test-Path -LiteralPath $McpPath)) {
            throw "MCP file not found: $McpPath"
        }
        $raw = Get-Content -LiteralPath $McpPath -Raw -Encoding UTF8
        $cfg = $raw | ConvertFrom-Json
        if (-not $cfg.mcpServers) {
            throw "No mcpServers found in: $McpPath"
        }

        $count = 0
        $imported = New-Object System.Collections.Generic.List[string]
        foreach ($serverProp in $cfg.mcpServers.PSObject.Properties) {
            $serverName = [string]$serverProp.Name
            $server = $serverProp.Value

            if ($server.PSObject.Properties.Name.Contains("env") -and $server.env) {
                foreach ($envProp in $server.env.PSObject.Properties) {
                    $k = [string]$envProp.Name
                    $v = [string]$envProp.Value
                    if ($k -match "KEY|TOKEN|SECRET|PASSWORD|WEBHOOK|JWT") {
                        Set-SecretEntry -Store $store -SecretName $k -SecretValue $v -SecretNote ("import-mcp:{0}:env" -f $serverName)
                        $imported.Add($k) | Out-Null
                        $count++
                    }
                }
            }

            if ($server.PSObject.Properties.Name.Contains("headers") -and $server.headers) {
                foreach ($hProp in $server.headers.PSObject.Properties) {
                    $hk = [string]$hProp.Name
                    $hv = [string]$hProp.Value
                    if ($hk -ieq "Authorization" -and $hv -match "^Bearer\s+(.+)$") {
                        $tokenName = ("{0}_AUTH_BEARER_TOKEN" -f ($serverName.ToUpper().Replace("-", "_")))
                        $tokenValue = $Matches[1]
                        Set-SecretEntry -Store $store -SecretName $tokenName -SecretValue $tokenValue -SecretNote ("import-mcp:{0}:header" -f $serverName)
                        $imported.Add($tokenName) | Out-Null
                        $count++
                    } elseif ($hk -match "KEY|TOKEN|SECRET") {
                        $headerName = ("{0}_{1}" -f ($serverName.ToUpper().Replace("-", "_")), ($hk.ToUpper().Replace("-", "_")))
                        Set-SecretEntry -Store $store -SecretName $headerName -SecretValue $hv -SecretNote ("import-mcp:{0}:header" -f $serverName)
                        $imported.Add($headerName) | Out-Null
                        $count++
                    }
                }
            }
        }

        Write-Store -Path $resolvedPath -Store $store
        $uniq = @($imported | Sort-Object -Unique)
        Write-Host ("Imported/updated secrets from mcp: {0}" -f $count) -ForegroundColor Green
        foreach ($n in $uniq) { Write-Output $n }
        exit 0
    }

    "sync-copilot-mcp-env" {
        $srcName = "COPILOT_AUTH_BEARER_TOKEN"
        if (-not $store.secrets.Contains($srcName)) {
            throw @"
Vault missing $srcName. Fix:
  1) Run: .\scripts\secrets-vault.ps1 -Action set -Name COPILOT_AUTH_BEARER_TOKEN -Value '<GitHub PAT>', OR
  2) Put it in mcp\user-env.ps1 then run: .\scripts\secrets-vault.ps1 -Action import-user-env
     (option 1 used to say "%USERPROFILE%\.cursor\mcp.json" -- that file is gone, Cursor retired 2026-08-26)
Then run this action again. See docs/operations/mcp-add-server-quickstart.md (copilot).
"@
        }
        $plain = Unprotect-Secret -CipherText $store.secrets[$srcName].cipher
        [Environment]::SetEnvironmentVariable("COPILOT_MCP_BEARER_TOKEN", $plain, "User")
        Write-Host "Set User-level env COPILOT_MCP_BEARER_TOKEN from vault $srcName." -ForegroundColor Green
        Write-Host "Update copilot MCP header to: Bearer `${env:COPILOT_MCP_BEARER_TOKEN} then fully quit Cursor and reopen (new processes read User env)." -ForegroundColor Yellow
        exit 0
    }

    "import-user-env" {
        # Reads a user-env.ps1 file (hashtable format: $vars = @{ KEY = "value" ... })
        # and batch-imports all non-empty key=value pairs into the vault.
        # Use this to keep the vault in sync with user-env.ps1 after any update.
        # Called automatically by import-cross-machine-memory.ps1 when user-env.ps1 changes.
        if ([string]::IsNullOrWhiteSpace($McpPath)) {
            $repoRoot = Split-Path $PSScriptRoot -Parent
            $McpPath = Join-Path $repoRoot "mcp\user-env.ps1"
        }
        if (-not (Test-Path -LiteralPath $McpPath)) {
            throw "user-env.ps1 not found: $McpPath"
        }
        # Parse hashtable with regex — avoids running setx side effects.
        # Matches: whitespace KEY = "value"  (double-quoted values, may contain any chars except ")
        $raw = Get-Content -LiteralPath $McpPath -Raw -Encoding UTF8
        $pattern = '(?m)^\s+([A-Z][A-Z0-9_]+)\s*=\s*"([^"]*)"'
        $matches2 = [regex]::Matches($raw, $pattern)
        $count = 0; $skipped = 0
        foreach ($m in $matches2) {
            $k = $m.Groups[1].Value
            $v = $m.Groups[2].Value
            if ([string]::IsNullOrWhiteSpace($v)) { $skipped++; continue }
            Set-SecretEntry -Store $store -SecretName $k -SecretValue $v -SecretNote "import-user-env"
            $count++
        }
        Write-Store -Path $resolvedPath -Store $store
        Write-Host "  vault import-user-env: $count imported, $skipped empty skipped" -ForegroundColor Green
        Write-Host "  source: $McpPath" -ForegroundColor DarkGray
        exit 0
    }

    { $_ -eq "sync-mcp-user-env" -or $_ -eq "sync-cursor-mcp-user-env" } {
        # MCP hosts resolve HTTP url/headers from the process environment, so a secret that lives
        # only in the vault is invisible to them until it is written to Windows User env.
        #
        # SOURCE = mcp/registry.template.json, deliberately, and NOT any generated client config:
        #   - .cursor\mcp.json (the old default) no longer exists -- Cursor retired 2026-08-26, and
        #     this branch threw "MCP file not found" from the moment that file stopped being generated.
        #   - .mcp.json is the obvious replacement and would SILENTLY SYNC NOTHING: Claude Code expands
        #     ${NAME}, not ${env:NAME}, so since 2026-08-28 that file has zero matches for the regex
        #     below -- and "found no names" reads exactly like "everything was already set".
        # The registry is the SSOT, keeps ${env:NAME} whatever any client wants, and is a superset (it
        # also covers servers a given client excludes). Which secrets must reach User env is a property
        # of the registry, not of one client output format.
        $repoRoot = Split-Path $PSScriptRoot -Parent
        $target = Join-Path $repoRoot "mcp\registry.template.json"
        if (-not [string]::IsNullOrWhiteSpace($McpPath)) {
            $target = $McpPath
        }
        if (-not (Test-Path -LiteralPath $target)) {
            throw "MCP file not found: $target"
        }
        $raw = Get-Content -LiteralPath $target -Raw -Encoding UTF8
        $matches = [regex]::Matches($raw, '\$\{env:([A-Z][A-Z0-9_]*)\}')
        if ($matches.Count -eq 0) {
            # "No names found" must never be mistaken for "nothing to do" -- that is how a syncer goes
            # quiet. If the source stops using the ${env:NAME} form, fail loudly instead of reporting 0.
            throw "No env placeholders found in: $target -- wrong source file, or its placeholder syntax changed."
        }
        $names = @($matches | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
        $set = 0
        $missing = New-Object System.Collections.Generic.List[string]
        foreach ($n in $names) {
            if (-not $store.secrets.Contains($n)) {
                $missing.Add($n) | Out-Null
                continue
            }
            $plain = Unprotect-Secret -CipherText $store.secrets[$n].cipher
            if ([string]::IsNullOrWhiteSpace($plain)) { continue }
            [Environment]::SetEnvironmentVariable($n, $plain, "User")
            $set++
            Write-Host "Set User env: $n" -ForegroundColor Green
        }
        if ($missing.Count -gt 0) {
            Write-Host ("Vault missing {0} name(s) referenced in {1}: {2}" -f $missing.Count, $target, ($missing -join ", ")) -ForegroundColor Yellow
            Write-Host "Add with: .\scripts\secrets-vault.ps1 -Action set -Name <NAME> -Value '<value>'" -ForegroundColor Yellow
        }
        Write-Host ("Synced {0} variable(s) to Windows User environment. Fully quit Claude Code / Claude Desktop and reopen." -f $set) -ForegroundColor Cyan
        exit 0
    }
}
