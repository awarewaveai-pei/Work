# Shared backup retention for the sync scripts.
#
# Extracted 2026-09-20 from sync-claude-userlevel.ps1 so the rule is testable on its own:
# the calling script runs work at top level, so it cannot be dot-sourced by a test without
# performing a real sync. A retention rule nobody can test is a rule nobody can trust.
#
# The rule it replaces was "keep the newest 15 directories". A burst of runs defeats that
# completely: on 2026-09-20 fifteen syncs landed between 11:35 and 12:22, so the whole
# backup history became 47 minutes deep. A backup exists to undo a change made EARLIER --
# an hour ago, yesterday, last week -- and a count-based window silently guarantees it
# cannot, precisely when you have been iterating hard and are most likely to need it.
#
# So retention is stated in the terms the guarantee is about:
#   * keep everything from the last -KeepDays days, EXCEPT no more than -MaxPerDay from any
#     single day,
#   * and keep the newest directory from each of the newest -KeepDistinctDays days that have any.
#
# The second clause is the floor that survives a long quiet stretch: after three idle weeks a
# purely time-based rule would leave nothing at all. The -MaxPerDay cap closes the hole the
# first draft of this rewrite opened: "keep everything within 14 days" means a runaway loop
# creating hundreds of directories in one afternoon is pruned by nothing for two weeks --
# strictly worse than the count-based rule it replaced, which at least capped the total. Found
# by self-review before this shipped, not by the disk filling up.

Set-StrictMode -Version Latest

function Get-BackupDayKey {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Prefix = 'claude-userlevel-'
  )

  # Day key comes from the directory NAME, never from a filesystem timestamp: copying or
  # restoring a backup rewrites mtime and would scramble the grouping.
  $pattern = '^' + [regex]::Escape($Prefix) + '(\d{8})-\d{6}$'
  if ($Name -match $pattern) { return $Matches[1] }
  return ''
}

function Select-BackupsToRemove {
  <#
    .SYNOPSIS
      Decide which backup directories are no longer needed. Pure: takes a list, returns names.
    .PARAMETER Backups
      Objects with `Name` and `Timestamp` (a DateTime). Order does not matter.
  #>
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Backups,
    [int]$KeepDays = 14,
    [int]$KeepDistinctDays = 10,
    [int]$MaxPerDay = 12,
    [string]$Prefix = 'claude-userlevel-',
    [datetime]$Now = (Get-Date)
  )

  if ($Backups.Count -eq 0) { return @() }

  $cutoff = $Now.AddDays(-$KeepDays)
  # Newest first, by name: the names are zero-padded yyyyMMdd-HHmmss, so a lexical sort IS
  # a chronological sort and does not depend on timestamps we just said not to trust.
  $ordered = @($Backups | Sort-Object -Property Name -Descending)

  $days = @($ordered | ForEach-Object { Get-BackupDayKey -Name $_.Name -Prefix $Prefix } |
    Where-Object { $_ } | Select-Object -Unique)
  $keptDays = @($days | Select-Object -First $KeepDistinctDays)

  # Rank within its own day, newest first: rank 0 is that day's representative, and anything
  # past $MaxPerDay is surplus even when it is minutes old.
  $rankInDay = @{}
  $seenPerDay = @{}
  foreach ($b in $ordered) {
    $day = Get-BackupDayKey -Name $b.Name -Prefix $Prefix
    if (-not $day) { $rankInDay[$b.Name] = 0; continue }
    if (-not $seenPerDay.ContainsKey($day)) { $seenPerDay[$day] = 0 }
    $rankInDay[$b.Name] = $seenPerDay[$day]
    $seenPerDay[$day] = $seenPerDay[$day] + 1
  }

  $remove = @()
  foreach ($b in $ordered) {
    $day = Get-BackupDayKey -Name $b.Name -Prefix $Prefix
    $rank = $rankInDay[$b.Name]
    # That day's newest survives on the distinct-day floor regardless of age.
    if ($day -and $keptDays -contains $day -and $rank -eq 0) { continue }
    # Inside the time window, but only up to the per-day cap.
    if ($b.Timestamp -gt $cutoff -and $rank -lt $MaxPerDay) { continue }
    $remove += $b.Name
  }
  return @($remove)
}

function Invoke-BackupRetention {
  <#
    .SYNOPSIS
      Apply Select-BackupsToRemove to a real directory. Best-effort: never throws.
  #>
  param(
    [Parameter(Mandatory = $true)][string]$ParentPath,
    [string]$Prefix = 'claude-userlevel-',
    [int]$KeepDays = 14,
    [int]$KeepDistinctDays = 10,
    [int]$MaxPerDay = 12
  )

  try {
    if (-not (Test-Path -LiteralPath $ParentPath)) { return @() }
    $dirs = @(Get-ChildItem -LiteralPath $ParentPath -Directory -Filter "$Prefix*" -ErrorAction SilentlyContinue |
      ForEach-Object {
        # Newest of the two stamps: a fresh copy has a new LastWriteTime but an older
        # CreationTime on some filesystems, and keeping too much is the safe error.
        $ts = if ($_.LastWriteTime -gt $_.CreationTime) { $_.LastWriteTime } else { $_.CreationTime }
        [pscustomobject]@{ Name = $_.Name; Timestamp = $ts; FullName = $_.FullName }
      })
    if ($dirs.Count -eq 0) { return @() }
    $doomed = Select-BackupsToRemove -Backups $dirs -KeepDays $KeepDays -KeepDistinctDays $KeepDistinctDays -MaxPerDay $MaxPerDay -Prefix $Prefix
    $byName = @{}
    foreach ($d in $dirs) { $byName[$d.Name] = $d.FullName }
    foreach ($name in $doomed) {
      Remove-Item -LiteralPath $byName[$name] -Recurse -Force -ErrorAction SilentlyContinue
    }
    return @($doomed)
  } catch {
    return @()
  }
}
