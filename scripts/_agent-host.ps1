# Which agent is driving this process: 'claude', 'codex' or 'unknown'.
#
# Used by the oracle scripts so the cross-model review cannot degrade into a
# model reviewing its own work (AGENTS.md section 4). Env vars are not reliable
# here: CLAUDECODE=1 leaks down into a `codex exec` that Claude started, so the
# nearest agent ancestor in the process tree decides. Dot-source only; ASCII only
# (Windows PowerShell 5.1 reads BOM-less .ps1 as CP950).

function Get-AgentHost {
    [CmdletBinding()]
    param([int]$StartPid = $PID, [int]$MaxDepth = 25)

    try {
        $proc = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $StartPid) -ErrorAction Stop
        for ($i = 0; $i -lt $MaxDepth -and $proc; $i++) {
            if ($proc.Name -match '^(?i)codex') { return 'codex' }
            if ($proc.Name -match '^(?i)claude') { return 'claude' }
            $proc = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $proc.ParentProcessId) -ErrorAction SilentlyContinue
        }
    } catch {
        # Fall through: an unreadable process table must not block a review.
    }
    if ($env:CLAUDECODE -eq '1') { return 'claude' }
    return 'unknown'
}
