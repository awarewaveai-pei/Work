param(
    [ValidateSet("list-projects", "get-project", "get")]
    [string]$Action = "list-projects",
    [int]$ProjectId = 0,
    [string]$Path = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-VaultJson {
    param([string]$VaultPath)
    # BOM-safe read (vault.json may be UTF-8 with BOM from tooling)
    $sr = New-Object System.IO.StreamReader($VaultPath, $true)
    try {
        return $sr.ReadToEnd()
    } finally {
        $sr.Close()
    }
}

function Get-PostHogCipherFromSecrets {
    param([object]$SecretsRoot)
    if (-not $SecretsRoot) { return $null }
    $wanted = @("POSTHOG_API_KEY", "POSTHOG_AUTH_BEARER_TOKEN", "POSTHOG_PERSONAL_API_KEY")
    foreach ($p in $SecretsRoot.PSObject.Properties) {
        if ($p.Name -notin $wanted) { continue }
        $entry = $p.Value
        if ($null -eq $entry) { continue }
        if ($entry.PSObject.Properties.Name -contains "cipher" -and $entry.cipher) {
            return [string]$entry.cipher
        }
    }
    return $null
}

function Get-PostHogApiKey {
    foreach ($envName in @("POSTHOG_API_KEY", "POSTHOG_PERSONAL_API_KEY")) {
        $v = [Environment]::GetEnvironmentVariable($envName, "Process")
        if (-not [string]::IsNullOrWhiteSpace($v)) {
            return $v.Trim()
        }
        $v = [Environment]::GetEnvironmentVariable($envName, "User")
        if (-not [string]::IsNullOrWhiteSpace($v)) {
            return $v.Trim()
        }
    }

    $vaultPath = Join-Path $env:LOCALAPPDATA "AgencyOS\secrets\vault.json"
    if (-not (Test-Path -LiteralPath $vaultPath)) {
        throw "PostHog API key not found in env and vault file is missing: $vaultPath. Set POSTHOG_API_KEY or run: .\scripts\secrets-vault.ps1 -Action import-mcp -McpPath `"$env:USERPROFILE\.cursor\mcp.json`""
    }

    $raw = Read-VaultJson -VaultPath $vaultPath
    $store = $raw | ConvertFrom-Json
    if (-not $store.secrets) {
        throw "Vault has no secrets section: $vaultPath"
    }

    $cipher = Get-PostHogCipherFromSecrets -SecretsRoot $store.secrets
    if (-not $cipher) {
        throw "PostHog Personal API key not in vault. Expected one of: POSTHOG_API_KEY, POSTHOG_AUTH_BEARER_TOKEN (from import-mcp posthog server), POSTHOG_PERSONAL_API_KEY. Run: .\scripts\secrets-vault.ps1 -Action import-mcp -McpPath `"$env:USERPROFILE\.cursor\mcp.json`""
    }

    $secure = ConvertTo-SecureString -String $cipher
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Invoke-PostHogApi {
    param(
        [string]$ApiPath
    )

    $apiKey = Get-PostHogApiKey
    $headers = @{ Authorization = "Bearer $apiKey" }
    $uri = "https://us.posthog.com$ApiPath"
    return Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
}

switch ($Action) {
    "list-projects" {
        Invoke-PostHogApi -ApiPath "/api/projects/" | ConvertTo-Json -Depth 8
        exit 0
    }
    "get-project" {
        if ($ProjectId -le 0) {
            throw "ProjectId must be provided for Action=get-project"
        }
        Invoke-PostHogApi -ApiPath "/api/projects/$ProjectId/" | ConvertTo-Json -Depth 8
        exit 0
    }
    "get" {
        if ([string]::IsNullOrWhiteSpace($Path)) {
            throw "Path must be provided for Action=get"
        }
        if (-not $Path.StartsWith("/")) {
            $Path = "/$Path"
        }
        Invoke-PostHogApi -ApiPath $Path | ConvertTo-Json -Depth 10
        exit 0
    }
}
