param(
    [ValidateSet("init", "set", "set-prompt", "get", "list", "remove", "run", "import-mcp")]
    [string]$Action = "list",
    [string]$Name = "",
    [string]$Value = "",
    [string]$Note = "",
    [string[]]$Names = @(),
    [string]$Command = "",
    [string]$StorePath = "",
    [string]$McpPath = "D:\Work\mcp.json"
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
                throw "Secret not found: $n"
            }
            $plain = Unprotect-Secret -CipherText $store.secrets[$n].cipher
            Set-Item -Path ("Env:{0}" -f $n) -Value $plain
        }
        Invoke-Expression $Command
        exit $LASTEXITCODE
    }

    "import-mcp" {
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
}
