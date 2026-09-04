<#
.SYNOPSIS
  Circuit breaker for the external review oracles (critic subagent, Codex CLI). The moment a quota / rate
  limit is observed, record WHEN it resets; every later review attempt checks the record FIRST and, if the
  reset is still in the future, goes straight to the fallback without connecting again.

.DESCRIPTION
  Why (operator, 2026-09-04): "怎麼發現撞到額度問題就馬上停止，不要嘗試再連". On 2026-09-04 the critic
  returned HTTP 429 (session limit) and Codex returned "usage limit … try again at Sep 7th 2026 11:06";
  each retry would have burned a turn and, for Codex, more of a quota that was already gone.

  State file: $env:TEMP\claude-oracle-quota.json  (shared by every session on this machine -- a quota is
  per account, not per session), shape:
    { "codex":  { "blocked_until": "2026-09-07T11:06:00+08:00", "reason": "...", "set_at": "..." },
      "critic": { ... } }

.PARAMETER Action
  check  -- print the state for -Tool (or all); exit 0 = free to try, exit 3 = BLOCKED (do not connect).
  set    -- record a block for -Tool until -Until (ISO 8601 or any DateTime-parsable string) or now + -Hours.
  clear  -- remove the block for -Tool (after a successful call, or when the operator says so).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/oracle-quota.ps1 -Action check -Tool codex
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/oracle-quota.ps1 -Action set -Tool codex -Until "2026-09-07 11:06" -Reason "usage limit (codex-companion exit 1)"
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/oracle-quota.ps1 -Action set -Tool critic -Hours 5 -Reason "HTTP 429 session limit"
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/oracle-quota.ps1 -Action clear -Tool codex
#>
[CmdletBinding()]
param(
    [ValidateSet('check', 'set', 'clear')] [string]$Action = 'check',
    [ValidateSet('codex', 'critic', 'all')] [string]$Tool = 'all',
    [string]$Until = '',
    [double]$Hours = 0,
    [string]$Reason = ''
)
$ErrorActionPreference = 'Stop'
$stateFile = Join-Path $env:TEMP 'claude-oracle-quota.json'

function Read-State {
    if (-not (Test-Path -LiteralPath $stateFile)) { return @{} }
    try { $raw = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8; if (-not $raw.Trim()) { return @{} }
          $obj = $raw | ConvertFrom-Json; $h = @{}; foreach ($p in $obj.PSObject.Properties) { $h[$p.Name] = $p.Value }; return $h }
    catch { Write-Host "oracle-quota: state file unreadable ($($_.Exception.Message)); treating as empty" -ForegroundColor Yellow; return @{} }
}
function Write-State($h) { ($h | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath $stateFile -Encoding UTF8 }

$state = Read-State
$now = Get-Date

switch ($Action) {
    'set' {
        if ($Tool -eq 'all') { throw "set needs -Tool codex|critic" }
        if ($Until) { $untilDt = [DateTime]::Parse($Until) } elseif ($Hours -gt 0) { $untilDt = $now.AddHours($Hours) } else { throw "set needs -Until <time> or -Hours <n>" }
        $state[$Tool] = @{ blocked_until = $untilDt.ToString('o'); reason = $Reason; set_at = $now.ToString('o') }
        Write-State $state
        Write-Host ("oracle-quota: {0} BLOCKED until {1} ({2}). Do not connect before then; use the fallback (self-review + ORACLE_WAIVED)." -f $Tool, $untilDt.ToString('yyyy-MM-dd HH:mm'), $Reason)
        exit 0
    }
    'clear' {
        if ($Tool -eq 'all') { $state = @{} } else { $state.Remove($Tool) | Out-Null }
        Write-State $state
        Write-Host "oracle-quota: cleared ($Tool)"
        exit 0
    }
    'check' {
        $tools = if ($Tool -eq 'all') { @('codex', 'critic') } else { @($Tool) }
        $blocked = $false
        foreach ($t in $tools) {
            if ($state.ContainsKey($t) -and $state[$t]) {
                $untilDt = [DateTime]::Parse($state[$t].blocked_until)
                if ($untilDt -gt $now) {
                    $blocked = $true
                    $left = [math]::Round(($untilDt - $now).TotalMinutes)
                    Write-Host ("oracle-quota: {0} BLOCKED until {1} ({2} min left) -- {3}. DO NOT CONNECT; go to the fallback." -f $t, $untilDt.ToString('yyyy-MM-dd HH:mm'), $left, $state[$t].reason)
                } else {
                    Write-Host ("oracle-quota: {0} block expired at {1}; free to try once (clear the entry on success)." -f $t, $untilDt.ToString('yyyy-MM-dd HH:mm'))
                }
            } else {
                Write-Host "oracle-quota: $t -- no block recorded; free to try."
            }
        }
        if ($blocked) { exit 3 } else { exit 0 }
    }
}
