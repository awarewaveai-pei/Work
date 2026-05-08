Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$base = 'https://sentry.io/api/0'
$token = $env:SENTRY_AUTH_TOKEN
$org = 'awarewave'
$proj = 'javascript-nextjs'

# Get unresolved issues from last 30 minutes for the next-admin project
$cutoffMs = ([DateTimeOffset](Get-Date).AddMinutes(-30).ToUniversalTime()).ToUnixTimeMilliseconds()

$query = 'is:unresolved age:-30m'
$uri = "$base/projects/$org/$proj/issues/?query=$([uri]::EscapeDataString($query))&statsPeriod=30m&limit=20"
try {
  $resp = Invoke-RestMethod -Method GET -Uri $uri -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 15
  if (-not $resp -or $resp.Count -eq 0) {
    "No unresolved issues in last 30 minutes for $org/$proj"
  } else {
    "Unresolved issues in last 30 min ($($resp.Count)):"
    foreach ($i in $resp) {
      "  [{0}] {1} | last_seen={2} | events={3}" -f $i.shortId, $i.title.Substring(0,[Math]::Min(80,$i.title.Length)), $i.lastSeen, $i.count
    }
  }
} catch {
  "ERR fetching: $($_.Exception.Message)"
}

"---"

# Also fetch top 5 issues regardless of age, sorted by last_seen DESC
$uri2 = "$base/projects/$org/$proj/issues/?query=$([uri]::EscapeDataString('is:unresolved'))&sort=date&limit=5"
try {
  $resp = Invoke-RestMethod -Method GET -Uri $uri2 -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 15
  "Top 5 unresolved issues by last_seen (any age):"
  foreach ($i in $resp) {
    "  [{0}] {1} | last_seen={2} | events={3}" -f $i.shortId, $i.title.Substring(0,[Math]::Min(70,$i.title.Length)), $i.lastSeen, $i.count
  }
} catch {
  "ERR: $($_.Exception.Message)"
}
