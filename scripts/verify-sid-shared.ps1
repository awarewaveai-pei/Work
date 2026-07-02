<#
.SYNOPSIS
  Shared SID derivation for verify-recent + verify-recent-ack.
  MUST stay byte-compatible with mcp/claude-userlevel/hooks/lib/shared.js getSessionId().

.DESCRIPTION
  Dot-source from any PowerShell consumer:
    . "$repoRoot\scripts\verify-sid-shared.ps1"
    $sid = Get-VerifySid

  Priority order (must match lib/shared.js getSessionId):
    1. (NOT SUPPORTED IN PS) stdin's session_id field — only the JS hooks receive that
    2. $env:CLAUDE_CODE_SESSION_ID — verified live to be set by Claude Code in both bash + powershell
    3. $env:CLAUDE_SESSION_ID — legacy/dev-tooling name
    4. sha1([Environment]::CurrentDirectory).Substring(0, 16) — last-resort fallback

.NOTES
  KNOWN LIMITATION: This PS helper does NOT read stdin's session_id field. The JS hooks do.
  In practice this is fine TODAY because CLAUDE_CODE_SESSION_ID env var is always set by Claude Code
  (verified 2026-05-22). If a future Claude Code release deprecates the env var and uses ONLY stdin,
  this PS path will fall through to the cwd-hash, which would diverge from the hooks' SID.
  Mitigation if that day comes: Claude Code will likely also pass session_id as a CLI arg or another
  env var name. Update this helper accordingly.

  WHY [Environment]::CurrentDirectory and NOT (Get-Location).Path:
  PowerShell's (Get-Location) returns the PS-provider location (could be HKLM:\ or other non-FS).
  [Environment]::CurrentDirectory always returns the OS process cwd as a filesystem path, byte-matching
  Node's process.cwd().
#>

function Get-VerifySid {
    $primary = $env:CLAUDE_CODE_SESSION_ID
    if ($primary -and $primary.Trim()) {
        $clean = ($primary.Trim()) -replace '[^a-zA-Z0-9_-]', '_'
        return $clean.Substring(0, [Math]::Min(64, $clean.Length))
    }
    $legacy = $env:CLAUDE_SESSION_ID
    if ($legacy -and $legacy.Trim()) {
        $clean = ($legacy.Trim()) -replace '[^a-zA-Z0-9_-]', '_'
        return $clean.Substring(0, [Math]::Min(64, $clean.Length))
    }
    # OS-level cwd (matches Node process.cwd()), NOT PS-provider Get-Location which may be HKLM: etc.
    $cwd = [Environment]::CurrentDirectory
    $sha1 = [System.Security.Cryptography.SHA1]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($cwd)
    $hash = ($sha1.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
    return $hash.Substring(0, 16)
}

function Get-VerifyTrackerPath {
    param([string]$Sid = $(Get-VerifySid))
    return Join-Path $env:TEMP "claude-unverified-code-$Sid.txt"
}
