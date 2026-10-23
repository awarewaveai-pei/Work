#requires -Version 5.1
<#
.SYNOPSIS
  Always-On Command Plane smoke test.

.DESCRIPTION
  Runs the 9 verification checks defined in
  `agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md` (mirrored from the
  approved plan, §9.1):

  1. Migration applied (command_requests + system_modes exist)
  2. Kill switch seeded (global mode='normal')
  3. Idempotency (duplicate update_id stays as one row)
  4. Kill switch blocks (emergency_stop -> blocked_by_killswitch)
  5. Hard block from telegram (/deploy_production -> blocked_by_policy)
  6. Low-risk handler dispatches (/status -> completed)
  7. Failure-path writes error_events (unknown command rejected; we do not
     synthesise a handler crash to keep this test side-effect free)
  8. Auth: missing secret header is silently accepted (200) but writes
     telegram_auth_failed to error_events.
  9. Phase 2a: /emergency_stop via Telegram completes AND updates
     system_modes.mode='emergency_stop' (then restored to 'normal').

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

. (Join-Path $PSScriptRoot 'lib\_detector-contract.ps1')

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

# --- Check 9: /emergency_stop via Telegram updates system_modes (Phase 2a) -
try {
  $uid7 = 996000 + (Get-Random -Minimum 1 -Maximum 9999)
  Send-TelegramUpdate -UpdateId $uid7 -Text '/emergency_stop' | Out-Null
  Start-Sleep -Milliseconds 1500
  $rows = Get-Request-By-Source-Event -SourceEventId $uid7
  $cmdStatus = ($rows | Select-Object -First 1).status
  $modeRows = Invoke-Supabase -Method GET -Path 'system_modes?scope_type=eq.global&select=mode'
  $globalMode = ($modeRows | Select-Object -First 1).mode
  $pass = ($cmdStatus -eq 'completed' -and $globalMode -eq 'emergency_stop')
  Add-Check -Name 'emergency_stop_via_telegram' -Pass $pass -Detail "cmd=$cmdStatus mode=$globalMode"
} catch {
  Add-Check -Name 'emergency_stop_via_telegram' -Pass $false -Detail $_.Exception.Message
} finally {
  try {
    Invoke-Supabase -Method PATCH -Path 'system_modes?scope_type=eq.global' -Body @{ mode = 'normal' } | Out-Null
  } catch {}
}

# --- Check 10: /trigger_staging_workflow with bad task -> error path -------
# We do NOT trigger an allowlisted task in smoke (would consume real Trigger.dev
# resources). Instead we send an unknown task name and verify the handler
# returns gracefully (status='completed' with error in result, not crash).
try {
  $uid8 = 997000 + (Get-Random -Minimum 1 -Maximum 9999)
  Send-TelegramUpdate -UpdateId $uid8 -Text '/trigger_staging_workflow no-such-task' | Out-Null
  $rows = Get-Request-By-Source-Event -SourceEventId $uid8
  $st = ($rows | Select-Object -First 1).status
  Add-Check -Name 'trigger_workflow_allowlist' -Pass ($st -eq 'completed') -Detail "status=$st"
} catch {
  Add-Check -Name 'trigger_workflow_allowlist' -Pass $false -Detail $_.Exception.Message
}

# --- Check 11: /replay_dead_letter with invalid uuid -> error path ---------
try {
  $uid9 = 998000 + (Get-Random -Minimum 1 -Maximum 9999)
  Send-TelegramUpdate -UpdateId $uid9 -Text '/replay_dead_letter not-a-uuid' | Out-Null
  $rows = Get-Request-By-Source-Event -SourceEventId $uid9
  $st = ($rows | Select-Object -First 1).status
  Add-Check -Name 'replay_dead_letter_validation' -Pass ($st -eq 'completed') -Detail "status=$st"
} catch {
  Add-Check -Name 'replay_dead_letter_validation' -Pass $false -Detail $_.Exception.Message
}

# --- Check 12: Phase 2c — /normal_mode from Telegram is hard-blocked --------
# /normal_mode is risk='high'; policyEngine HARD_BLOCK_FROM['telegram'] includes
# 'high' and 'critical'. So Telegram cannot unlock the killswitch even when the
# bot is allowed-listed. Expect status='blocked_by_policy'.
try {
  $uid10 = 991000 + (Get-Random -Minimum 1 -Maximum 999)
  Send-TelegramUpdate -UpdateId $uid10 -Text '/normal_mode' | Out-Null
  Start-Sleep -Milliseconds 800
  $rows = Get-Request-By-Source-Event -SourceEventId $uid10
  $st = ($rows | Select-Object -First 1).status
  $reason = ($rows | Select-Object -First 1).rejection_reason
  Add-Check -Name 'normal_mode_hard_blocked_from_telegram' -Pass ($st -eq 'blocked_by_policy') -Detail "status=$st reason=$reason"
} catch {
  Add-Check -Name 'normal_mode_hard_blocked_from_telegram' -Pass $false -Detail $_.Exception.Message
}

# --- Check 13: Phase 2c — GET /api/ops/approvals responds with valid shape --
# Read-only smoke. Confirms the API endpoint is wired and returns role+pending list.
try {
  $resp = Invoke-WebRequest -Uri "$BaseUrl/api/ops/approvals?limit=10" -UseBasicParsing -TimeoutSec 10
  $json = $resp.Content | ConvertFrom-Json
  $hasShape = ($json.ok -eq $true) -and ($null -ne $json.role) -and ($null -ne $json.pending) -and ($null -ne $json.count)
  Add-Check -Name 'approvals_list_endpoint_shape' -Pass $hasShape -Detail "role=$($json.role) count=$($json.count)"
} catch {
  Add-Check -Name 'approvals_list_endpoint_shape' -Pass $false -Detail $_.Exception.Message
}

# --- Check 14: Phase 2c — GET /api/ops/system-modes responds with current ----
try {
  $resp = Invoke-WebRequest -Uri "$BaseUrl/api/ops/system-modes" -UseBasicParsing -TimeoutSec 10
  $json = $resp.Content | ConvertFrom-Json
  $hasShape = ($json.ok -eq $true) -and ($null -ne $json.current) -and ($null -ne $json.current.mode)
  Add-Check -Name 'system_modes_get_shape' -Pass $hasShape -Detail "mode=$($json.current.mode)"
} catch {
  Add-Check -Name 'system_modes_get_shape' -Pass $false -Detail $_.Exception.Message
}

# --- Check 15: Phase 2c — POST /api/ops/approvals/<random-uuid>/approve is wired -
# Proves the dynamic [id]/approve route is reachable. Two valid outcomes:
#   404 + command_request_not_found  → route reached DB lookup, UUID not found (ideal)
#   403 + forbidden_role             → route reached RBAC gate (production strips simulated
#                                      role header without a valid x-ops-proxy-auth match)
# Both prove the Next.js dynamic route is wired. Any other status = route not present.
try {
  $bogus = [guid]::NewGuid().ToString()
  $resp = Invoke-WebRequest -Uri "$BaseUrl/api/ops/approvals/$bogus/approve" `
    -Method Post -UseBasicParsing -TimeoutSec 10 `
    -Headers @{ 'x-ops-simulated-role' = 'admin' } `
    -ErrorAction SilentlyContinue
  $json = $resp.Content | ConvertFrom-Json
  $passes = ($resp.StatusCode -eq 404) -or ($json.error -eq 'command_request_not_found') -or
            ($resp.StatusCode -eq 403) -or ($json.error -eq 'forbidden_role')
  Add-Check -Name 'approve_route_wired' -Pass $passes -Detail "status=$($resp.StatusCode) error=$($json.error)"
} catch {
  # Invoke-WebRequest throws on non-2xx; inspect exception response.
  $errResp = $_.Exception.Response
  if ($errResp) {
    $reader = New-Object System.IO.StreamReader($errResp.GetResponseStream())
    $body = $reader.ReadToEnd()
    $passes = ($errResp.StatusCode.value__ -eq 404) -or ($body -match 'command_request_not_found') -or
              ($errResp.StatusCode.value__ -eq 403) -or ($body -match 'forbidden_role')
    Add-Check -Name 'approve_route_wired' -Pass $passes -Detail "status=$($errResp.StatusCode.value__) body=$($body.Substring(0, [Math]::Min(120,$body.Length)))"
  } else {
    Add-Check -Name 'approve_route_wired' -Pass $false -Detail $_.Exception.Message
  }
}

# --- Cleanup: drop smoke rows -----------------------------------------------
try {
  $smokeIds = @(990000..998999) -join ','
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
  # measured = checks that reached a verdict (a thrown probe is recorded as a failed check, so overall is FAIL, never PASS).
  $reportFields = @{}
  foreach ($p in $report.PSObject.Properties) { $reportFields[$p.Name] = $p.Value }
  Write-DetectorArtifact -Path $ReportPath -Overall $(if ($report.ok) { 'PASS' } else { 'FAIL' }) -Measured @($script:Results).Count -Fields $reportFields | Out-Null
  Write-Host "Report written to $ReportPath"
}

if ($report.ok) {
  Write-Host ""
  Write-Host ("command-plane smoke: ALL {0} CHECKS PASSED" -f $script:Results.Count) -ForegroundColor Green
  exit 0
} else {
  Write-Host ""
  Write-Host "command-plane smoke: $($failures.Count) check(s) failed" -ForegroundColor Red
  exit 1
}
