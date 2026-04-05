param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet("info", "success", "warn", "error")][string]$Level = "info"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$line = "[{0}] [{1}] {2} - {3}" -f $stamp, $Level.ToUpperInvariant(), $Title, $Message
Write-Host $line

$webhook = $env:AGENCY_OS_SLACK_WEBHOOK_URL
if ([string]::IsNullOrWhiteSpace($webhook)) {
    exit 0
}

try {
    $payload = @{
        text = ("*{0}*`n{1}`n`n_{2}_" -f $Title, $Message, $stamp)
    } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri $webhook -ContentType "application/json" -Body $payload | Out-Null
} catch {
    Write-Warning ("notify-ops: Slack webhook failed: " + $_.Exception.Message)
}

exit 0
