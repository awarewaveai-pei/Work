param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
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
    $items = @($Response.organic ?? $Response.news ?? $Response.images ?? @())
    foreach ($item in $items) {
        Write-Output ($item.title ?? $item.imageUrl ?? "(no title)")
        if ($item.link) { Write-Output "  $($item.link)" }
        if ($item.snippet) { Write-Output "  $($item.snippet)" }
        if ($item.date) { Write-Output "  $($item.date)" }
        Write-Output ""
    }
}

if (-not $Args -or $Args.Count -eq 0 -or $Args[0] -in @("help", "--help", "-h")) {
    Show-Usage; exit 0
}

$command = $Args[0].ToLowerInvariant()
$rest = @($Args | Select-Object -Skip 1)
$json = $false
$gl = "us"
$num = 10
$queryParts = [System.Collections.Generic.List[string]]::new()

for ($i = 0; $i -lt $rest.Count; $i++) {
    switch ($rest[$i]) {
        "--json" { $json = $true }
        "--gl"   { $i++; $gl = $rest[$i] }
        "--num"  { $i++; $num = [int]$rest[$i] }
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
