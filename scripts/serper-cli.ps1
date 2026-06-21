param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CliArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-ApiKey {
    $key = [Environment]::GetEnvironmentVariable("SERPER_API_KEY", "Process")
    if ([string]::IsNullOrWhiteSpace($key)) {
        $key = [Environment]::GetEnvironmentVariable("SERPER_API_KEY", "User")
    }
    if ([string]::IsNullOrWhiteSpace($key)) {
        throw "Missing SERPER_API_KEY. Set it via mcp/user-env.ps1 or system env."
    }
    return $key
}

function Invoke-Serper {
    param([string]$Endpoint, [hashtable]$Body, [switch]$Json)
    $payload = $Body | ConvertTo-Json -Depth 10
    $response = Invoke-RestMethod -Method Post `
        -Uri ("https://google.serper.dev" + $Endpoint) `
        -Headers @{ "X-API-KEY" = (Get-ApiKey); "Content-Type" = "application/json" } `
        -Body $payload
    if ($Json) { $response | ConvertTo-Json -Depth 20; return }
    return $response
}

function Show-Usage {
    @"
Usage:
  serper search  <query>  [--gl <country>] [--num <n>] [--json]
  serper news    <query>  [--gl <country>] [--num <n>] [--json]
  serper images  <query>  [--gl <country>] [--num <n>] [--json]

Options:
  --gl <code>   Country code (default: us). tw = Taiwan, hk = Hong Kong
  --num <n>     Number of results (default: 10)
  --json        Raw JSON output

Examples:
  serper search "Claude AI latest news"
  serper news   "Taiwan earthquake" --gl tw
  serper search "apple inc" --num 5 --json
"@ | Write-Output
}

function Write-SearchResults {
    param($Response)
    if ($Response.answerBox) {
        Write-Output "=== Answer Box ==="
        $ans = if ($Response.answerBox.answer) { $Response.answerBox.answer } elseif ($Response.answerBox.snippet) { $Response.answerBox.snippet } else { "" }
        Write-Output $ans
        Write-Output ""
    }
    $items = if ($Response.organic) { @($Response.organic) } elseif ($Response.news) { @($Response.news) } elseif ($Response.images) { @($Response.images) } else { @() }
    foreach ($item in $items) {
        $titleVal = if ($item.title) { $item.title } elseif ($item.imageUrl) { $item.imageUrl } else { "(no title)" }
        Write-Output $titleVal
        if ($item.link) { Write-Output "  $($item.link)" }
        if ($item.snippet) { Write-Output "  $($item.snippet)" }
        if ($item.date) { Write-Output "  $($item.date)" }
        Write-Output ""
    }
}

if (-not $CliArgs -or $CliArgs.Count -eq 0 -or $CliArgs[0] -in @("help", "--help", "-h")) {
    Show-Usage; exit 0
}

$command = $CliArgs[0].ToLowerInvariant()
$rest = @($CliArgs | Select-Object -Skip 1)
$json = $false
$gl = "us"
$num = 10
$queryParts = [System.Collections.Generic.List[string]]::new()

for ($i = 0; $i -lt $rest.Count; $i++) {
    switch ($rest[$i]) {
        "--json" { $json = $true }
        "--gl"   { if ($i + 1 -lt $rest.Count) { $i++; $gl = $rest[$i] } else { throw "--gl requires a value" } }
        "--num"  { if ($i + 1 -lt $rest.Count) { $i++; if (-not [int]::TryParse($rest[$i], [ref]$num)) { throw "--num must be an integer" } } else { throw "--num requires a value" } }
        default  { $queryParts.Add($rest[$i]) }
    }
}

$query = ($queryParts -join " ").Trim()

$endpointMap = @{ "search" = "/search"; "news" = "/news"; "images" = "/images" }
if (-not $endpointMap.ContainsKey($command)) {
    throw "Unknown command: $command. Run 'serper help'."
}
if ([string]::IsNullOrWhiteSpace($query)) {
    throw "Query is required."
}

$body = @{ q = $query; gl = $gl; num = $num }
$response = Invoke-Serper -Endpoint $endpointMap[$command] -Body $body -Json:$json
if (-not $json) { Write-SearchResults -Response $response }
