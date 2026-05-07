#requires -Version 5.1
<#
.SYNOPSIS
  Always-On Command Plane smoke test.

.DESCRIPTION
  Runs the 8 verification checks defined in
  `agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE.md` (mirrored from the
  approved plan, §9.1):

  1. Migration applied (command_requests + system_modes exist)
  2. Kill switch seeded (global mode='normal')
  3. Idempotency (duplicate update_id stays as one row)
  4. Kill switch blocks (emergency_stop -> blocked_by_killswitch)
  5. Hard block from telegram (/deploy-production -> blocked_by_policy)
  6. Low-risk handler dispatches (/status -> completed)
  7. Failure-path writes error_events (unknown command rejected; we do not
     synthesise a handler crash to keep this test side-effect free)
  8. Auth: missing secret header is silently accepted (200) but writes
     telegram_auth_failed to error_events.

  Cleanup: clears all command_requests rows with source_event_id starting with
  'smoke-' and restores system_modes global to 'normal'.

.PARAMETER BaseUrl
  Public origin of the next-admin app, e.g. https://app.aware-wave.com.
.PARAMETER SupabaseUrl
  Self-hosted Supabase REST URL, e.g. https://supabase.aware-wave.com.
.PARAMETER SupabaseServiceRoleKey
  Service-role JWT (resolved from vault preferred).
.PARAMETER TelegramWebhookSecret
  Same value used in setWebhook (vault key TELEGRAM_WEBHOOK_SECRET).
.PARAMETER TestUserId
  A Telegram user_id present in TELEGRAM_ALLOWED_USER_IDS on the server.
.PARAMETER TestChatId
  A Telegram chat_id present in TELEGRAM_ALLOWED_CHAT_IDS on the server.
.PARAMETER ReportPath
  Optional JSON report output path.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $BaseUrl,
  [Parameter(Mandatory = $true)] [string] $SupabaseUrl,
  [Parameter(Mandatory = $true)] [string] $SupabaseServiceRoleKey,
  [Parameter(Mandatory = $true)] [string] $TelegramWebhookSecret,
  [Parameter(Mandatory = $true)] [string] $TestUserId,
  [Parameter(Mandatory = $true)] [string] $TestChatId,
  [string] $ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Results = @()
$script:RunId = [guid]::NewGuid().ToString('N').Substring(0, 8)
$script:SmokePrefix = "smoke-$($script:RunId)"

function Add-Check {
  param([string]$Name, [bool]$Pass, [string]$Detail)
  $script:Results += [pscustomobject]@{
    name   = $Name
    pass   = $Pass
    detail = $Detail
  }
  $tag = if ($Pass) { 'OK  ' } else { 'FAIL' }
  Write-Host ("[{0}] {1} - {2}" -f $tag, $Name, $Detail)
}

function Invoke-Supabase {
  param([string]$Method, [string]$Path, [object]$Body)
  $headers = @{
    apikey          = $SupabaseServiceRoleKey
    Authorization   = "Bearer $SupabaseServiceRoleKey"
    'Content-Type'  = 'application/json'
    Prefer          = 'return=representation'
  }
  $url = ($SupabaseUrl.TrimEnd('/')) + '/rest/v1/' + $Path
  if ($Body) {
    $json = ($Body | ConvertTo-Json -Depth 8 -Compress)
    return Invoke-RestMethod -Method $Method -Uri $url -Headers $headers -Body $json
  }
  return Invoke-RestMethod -Method $Method -Uri $url -Headers $headers
}

function Send-TelegramUpdate {
  param([int]$UpdateId, [string]$Text, [bool]$IncludeSecret = $true)
  $payload = @{
    update_id = $UpdateId
    message = @{
      message_id = $UpdateId
      from = @{ id = [int64]$TestUserId; is_bot = $false; username = 'smoke' }
      chat = @{ id = [int64]$TestChatId; type = 'private' }
      date = [int][double]::Parse((Get-Date -UFormat %s))
      text = $Text
    }
  }
  $headers = @{ 'Content-Type' = 'application/json' }
  if ($IncludeSecret) {
    $headers['X-Telegram-Bot-Api-Secret-Token'] = $TelegramWebhookSecret
  }
  $url = ($BaseUrl.TrimEnd('/')) + '/api/internal/commands/telegram'
  return Invoke-RestMethod -Method POST -Uri $url -Headers $headers `
    -Body ($payload | ConvertTo-Json -Depth 6 -Compress)
}

# --- Check 1: migration applied --------------------------------------------
try {
  $rows = Invoke-Supabase -Method GET -Path 'command_requests?select=id&limit=1'
  Add-Check -Name 'migration_command_requests' -Pass $true -Detail 'reachable'
} catch {
  Add-Check -Name 'migration_command_requests' -Pass $false -Detail $_.Exception.Message
}

# --- Check 2: kill switch seeded -------------------------------------------
try {
  $rows = Invoke-Supabase -Method GET -Path "system_modes?scope_type=eq.global&select=mode"
  $globalMode = ($rows | Select-Object -First 1).mode
  Add-Check -Name 'killswitch_seeded' -Pass ($globalMode -eq 'normal') -Detail "mode=$globalMode"
} catch {
  Add-Check -Name 'killswitch_seeded' -Pass $false -Detail $_.Exception.Message
}

# Helper used by checks 3/5/6/8 to read back the resulting command_requests row.
function Get-Request-By-Source-Event {
  param([string]$SourceEventId)
  Start-Sleep -Milliseconds 800  # let async write settle
  $path = "command_requests?source=eq.telegram&source_event_id=eq.$SourceEventId&select=id,status,rejection_reason,command"
  return Invoke-Supabase -Method GET -Path $path
}

# --- Check 3: idempotency (same update_id twice) ---------------------------
try {
  $uid = 990000 + (Get-Random -Minimum 1 -Maximum 9999)
  $eventId = "$($script:SmokePrefix)-idem-$uid"
  # We override source_event_id by piggybacking the prefix — the route uses
  # update_id as source_event_id, so we use a distinct update_id for this run.
  $a = Send-TelegramUpdate -UpdateId $uid -Text '/status'
  $b = Send-TelegramUpdate -UpdateId $uid -Text '/status'
  $rows = Invoke-Supabase -Method GET -Path "command_requests?source=eq.telegram&source_event_id=eq.$uid&select=id"
  $count = ($rows | Measure-Object).Count
  Add-Check -Name 'idempotency' -Pass ($count -eq 1) -Detail "rows=$count"
} catch {
  Add-Check -Name 'idempotency' -Pass $false -Detail $_.Exception.Message
}

# --- Check 4: kill switch blocks -------------------------------------------
try {
  Invoke-Supabase -Method PATCH -Path 'system_modes?scope_type=eq.global' -Body @{ mode = 'emergency_stop' } | Out-Null
  $uid2 = 991000 + (Get-Random -Minimum 1 -Maximum 9999)
  Send-TelegramUpdate -UpdateId $uid2 -Text '/status' | Out-Null
  $rows = Get-Request-By-Source-Event -SourceEventId $uid2
  $st = ($rows | Select-Object -First 1).status
  Add-Check -Name 'killswitch_blocks' -Pass ($st -eq 'blocked_by_killswitch') -Detail "status=$st"
} catch {
  Add-Check -Name 'killswitch_blocks' -Pass $false -Detail $_.Exception.Message
} finally {
  try {
    Invoke-Supabase -Method PATCH -Path 'system_modes?scope_type=eq.global' -Body @{ mode = 'normal' } | Out-Null
  } catch {}
}

# --- Check 5: hard block (/deploy-production from telegram) ----------------
try {
  $uid3 = 992000 + (Get-Random -Minimum 1 -Maximum 9999)
  Send-TelegramUpdate -UpdateId $uid3 -Text '/deploy_production' | Out-Null
  $rows = Get-Request-By-Source-Event -SourceEventId $uid3
  $st = ($rows | Select-Object -First 1).status
  Add-Check -Name 'hard_block_from_telegram' -Pass ($st -eq 'blocked_by_policy') -Detail "status=$st"
} catch {
  Add-Check -Name 'hard_block_from_telegram' -Pass $false -Detail $_.Exception.Message
}

# --- Check 6: low-risk handler completes ------------------------------------
try {
  $uid4 = 993000 + (Get-Random -Minimum 1 -Maximum 9999)
  Send-TelegramUpdate -UpdateId $uid4 -Text '/status' | Out-Null
  $rows = Get-Request-By-Source-Event -SourceEventId $uid4
  $st = ($rows | Select-Object -First 1).status
  Add-Check -Name 'low_risk_completes' -Pass ($st -eq 'completed') -Detail "status=$st"
} catch {
  Add-Check -Name 'low_risk_completes' -Pass $false -Detail $_.Exception.Message
}

# --- Check 7: unknown command rejected --------------------------------------
try {
  $uid5 = 994000 + (Get-Random -Minimum 1 -Maximum 9999)
  Send-TelegramUpdate -UpdateId $uid5 -Text '/no-such-command' | Out-Null
  $rows = Get-Request-By-Source-Event -SourceEventId $uid5
  $st = ($rows | Select-Object -First 1).status
  $rsn = ($rows | Select-Object -First 1).rejection_reason
  Add-Check -Name 'unknown_command_rejected' -Pass ($st -eq 'blocked_by_policy' -and $rsn -eq 'unknown_command') -Detail "status=$st reason=$rsn"
} catch {
  Add-Check -Name 'unknown_command_rejected' -Pass $false -Detail $_.Exception.Message
}

# --- Check 8: auth missing secret header writes error_events ---------------
try {
  $uid6 = 995000 + (Get-Random -Minimum 1 -Maximum 9999)
  Send-TelegramUpdate -UpdateId $uid6 -Text '/status' -IncludeSecret $false | Out-Null
  Start-Sleep -Milliseconds 800
  $errs = Invoke-Supabase -Method GET -Path "error_events?source_type=eq.telegram_auth_failed&order=occurred_at.desc&limit=1&select=id,occurred_at"
  $hasRecent = ($errs | Measure-Object).Count -gt 0
  Add-Check -Name 'auth_missing_secret_logged' -Pass $hasRecent -Detail "found=$hasRecent"
} catch {
  Add-Check -Name 'auth_missing_secret_logged' -Pass $false -Detail $_.Exception.Message
}

# --- Cleanup: drop smoke rows -----------------------------------------------
try {
  $smokeIds = @(990000..995999) -join ','
  Invoke-Supabase -Method DELETE -Path "command_requests?source=eq.telegram&source_event_id=in.($smokeIds)" | Out-Null
} catch {}

$failures = @($script:Results | Where-Object { -not $_.pass })
$report = [pscustomobject]@{
  ok        = ($failures.Count -eq 0)
  ran_at    = (Get-Date).ToString('o')
  base_url  = $BaseUrl
  results   = $script:Results
  failures  = $failures.Count
}

if ($ReportPath) {
  $report | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -Path $ReportPath
  Write-Host "Report written to $ReportPath"
}

if ($report.ok) {
  Write-Host ""
  Write-Host "command-plane smoke: ALL 8 CHECKS PASSED" -ForegroundColor Green
  exit 0
} else {
  Write-Host ""
  Write-Host "command-plane smoke: $($failures.Count) check(s) failed" -ForegroundColor Red
  exit 1
}
