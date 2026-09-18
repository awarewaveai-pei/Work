param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Search API only. The Sonar chat / Agent / Embeddings endpoints are billed per token by model
# (sonar-pro, sonar-reasoning-pro, deep-research) and burned the API budget twice (2026-06-21,
# 2026-09-12). Do not add them back; use the Search API or another provider.
$AllowedPath = "/search"

function Get-ApiKey {
    $apiKey = [Environment]::GetEnvironmentVariable("PERPLEXITY_API_KEY", "Process")
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        $apiKey = [Environment]::GetEnvironmentVariable("PERPLEXITY_API_KEY", "User")
    }
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        throw "Missing PERPLEXITY_API_KEY."
    }
    return $apiKey
}

function Read-InputText {
    param([string[]]$Parts)
    $text = ($Parts -join " ").Trim()
    if ([Console]::IsInputRedirected) {
        $stdin = [Console]::In.ReadToEnd().Trim()
        if (-not [string]::IsNullOrWhiteSpace($stdin)) {
            if ([string]::IsNullOrWhiteSpace($text)) {
                $text = $stdin
            } else {
                $text = "$stdin`n$text".Trim()
            }
        }
    }
    return $text
}

function Invoke-PerplexitySearch {
    param(
        [string]$Path,
        [string]$Body,
        [switch]$Json
    )

    if ($Path -ne $AllowedPath) {
        throw "Refused: only $AllowedPath is allowed (got '$Path')."
    }

    $headers = @{
        Authorization = "Bearer $(Get-ApiKey)"
        "Content-Type" = "application/json"
    }

    $response = Invoke-RestMethod -Method Post -Uri ("https://api.perplexity.ai" + $Path) -Headers $headers -Body $Body
    if ($Json) {
        $response | ConvertTo-Json -Depth 20
        return
    }
    return $response
}

function Show-Usage {
    @"
Usage:
  perplexity help
  perplexity search [options] <query>

Search API only (POST /search). Chat / agent / embeddings are intentionally not available.

Search options:
  --json
  --max-results <n>              Default: 10
  --max-tokens <n>               Default: 10000
  --max-tokens-per-page <n>      Default: 4096
  --country <code>
  --search-mode <web|academic|sec>
  --domain <host>                Repeatable
  --lang <code>                  Repeatable
"@ | Write-Output
}

function Write-SearchOutput {
    param($Response)
    foreach ($result in @($Response.results)) {
        Write-Output $result.title
        Write-Output $result.url
        if ($result.date) {
            Write-Output ("Date: " + $result.date)
        }
        if ($result.snippet) {
            Write-Output $result.snippet
        }
        Write-Output ""
    }
}

if (-not $Args -or $Args.Count -eq 0 -or $Args[0] -in @("help", "--help", "-h")) {
    Show-Usage
    exit 0
}

$command = $Args[0].ToLowerInvariant()
$rest = @($Args | Select-Object -Skip 1)
$json = $false

if ($command -ne "search") {
    throw "Unknown or disabled command: $command. Only 'search' is available. Run 'perplexity help'."
}

$maxResults = 10
$maxTokens = 10000
$maxTokensPerPage = 4096
$country = ""
$searchMode = ""
$domains = New-Object System.Collections.Generic.List[string]
$langs = New-Object System.Collections.Generic.List[string]
$queryParts = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $rest.Count; $i++) {
    $arg = $rest[$i]
    switch ($arg) {
        "--json" { $json = $true; continue }
        "--max-results" { $i++; $maxResults = [int]$rest[$i]; continue }
        "--max-tokens" { $i++; $maxTokens = [int]$rest[$i]; continue }
        "--max-tokens-per-page" { $i++; $maxTokensPerPage = [int]$rest[$i]; continue }
        "--country" { $i++; $country = $rest[$i]; continue }
        "--search-mode" { $i++; $searchMode = $rest[$i]; continue }
        "--domain" { $i++; $domains.Add($rest[$i]); continue }
        "--lang" { $i++; $langs.Add($rest[$i]); continue }
        default { $queryParts.Add($arg); continue }
    }
}

$query = Read-InputText -Parts $queryParts
if ([string]::IsNullOrWhiteSpace($query)) {
    throw "Query is required."
}

$body = @{
    query = $query
    max_results = $maxResults
    max_tokens = $maxTokens
    max_tokens_per_page = $maxTokensPerPage
}
if (-not [string]::IsNullOrWhiteSpace($country)) { $body.country = $country }
if (-not [string]::IsNullOrWhiteSpace($searchMode)) { $body.search_mode = $searchMode }
if ($domains.Count -gt 0) { $body.search_domain_filter = @($domains) }
if ($langs.Count -gt 0) { $body.search_language_filter = @($langs) }

$response = Invoke-PerplexitySearch -Path $AllowedPath -Body ($body | ConvertTo-Json -Depth 10) -Json:$json
if (-not $json) { Write-SearchOutput -Response $response }
exit 0
