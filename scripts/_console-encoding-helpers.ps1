<#
.SYNOPSIS
  Helpers for safely capturing external command (ssh/docker/etc.) stdout as UTF-8 on
  Big5-locale Windows.

.DESCRIPTION
  The CP950 trap: when PowerShell on a zh-TW Windows host captures stdout from external
  commands (& ssh, & docker, & git, etc.), it uses [Console]::OutputEncoding as the
  decoder. The default on Big5 systems is CP950, which corrupts UTF-8 multi-byte sequences
  (Chinese chars become `??`, and sometimes the byte stream eats newlines so two lines
  merge into one — exactly what happened to backfill-missed-daily.ps1 on 2026-05-22).

  This helper wraps a scriptblock with a UTF-8 encoding context that's automatically
  restored in a `finally` — so the caller's shell encoding state is never mutated.

  Pattern mirrors scripts/_vault-helpers.ps1 (dot-source, no side effects at load time,
  function-only). $PSScriptRoot-anchored from callers.

.EXAMPLE
  . (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")
  $out = Invoke-WithUtf8Console { & ssh @sshArgs 2>&1 }
  # $LASTEXITCODE survives — scriptblock runs in caller scope per PowerShell `&` semantics.

.NOTES
  - Use for ANY external command output capture where stdout may contain non-ASCII bytes
  - Safe to nest (saves+restores correctly)
  - $LASTEXITCODE auto-propagates from scriptblock to caller scope (verified empirically)
  - Falls through silently if [Console]::OutputEncoding is unavailable (rare, e.g. some
    service contexts) — the wrapped scriptblock still executes; encoding just isn't forced
#>

function Invoke-WithUtf8Console {
    <#
    .SYNOPSIS
      Run a scriptblock with [Console]::OutputEncoding temporarily set to UTF-8.
    .PARAMETER ScriptBlock
      The scriptblock to execute. Output is passed through to the caller via the pipeline.
    #>
    param(
        [Parameter(Mandatory = $true, Position = 0)]
        [scriptblock]$ScriptBlock
    )

    $prev = $null
    $haveConsole = $false
    try {
        $prev = [Console]::OutputEncoding
        $haveConsole = $true
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    } catch {
        # No console (rare service context) — skip the set, just run the block.
        # Better to let the command run than to fail-closed here.
    }

    try {
        # `& $ScriptBlock` invokes the block; output flows to the caller's pipeline.
        # $LASTEXITCODE set by native commands inside the block is visible after this call.
        & $ScriptBlock
    } finally {
        if ($haveConsole) {
            try { [Console]::OutputEncoding = $prev } catch { }
        }
    }
}
