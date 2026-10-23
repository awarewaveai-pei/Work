<#
.SYNOPSIS
  Typecheck the COMMITTED tree, not the working tree.

.DESCRIPTION
  Shared-worktree failure mode (2026-09-11, commit 656216805): a pathspec commit took a file that
  imported a type another concurrent session had only written locally. Local `tsc --noEmit` stayed
  green because the local tree had that declaration; HEAD did not build at all. Nothing caught it,
  because every gate we own inspects the working tree.

  Invariant enforced here: every commit's tree must typecheck on its own, against the dependency
  set that ref's own package-lock.json declares. Checks out a ref into a detached worktree, proves
  the local node_modules is exactly that dependency set before junctioning it in, runs tsc there.

  The proof is not optional and is not a directory-existence check. Until 2026-09-23 this script
  junctioned the local node_modules guarded by Test-Path alone, so it typechecked ref X against
  whatever happened to be installed right now: a ref that ADDS a dependency got a spurious TS2307
  blamed on the commit, and a ref that DROPS one passed on packages it never declared. Same bug
  class that kept prod auto-deploy red all day (sg-deploy.sh only ran npm install when
  node_modules was entirely absent). Ground truth for what is installed is npm's hidden lockfile
  the package directories themselves -- npm's node_modules/.package-lock.json only records what
  npm believes it installed, which is not the same question.

.PARAMETER Ref      git ref to check. Default HEAD.
.PARAMETER Build    also run `next build` (slower; catches route/runtime-level failures too).
.PARAMETER Keep     keep the scratch worktree for inspection instead of removing it.
.PARAMETER Install  on dependency drift, npm ci inside the worktree from the ref's own lockfile
                    instead of refusing. Minutes, not seconds -- the default is to refuse.
#>
param(
  [string]$Ref = "HEAD",
  [switch]$Build,
  [switch]$Keep,
  [switch]$Install
)

$ErrorActionPreference = "Stop"
# CP950 protection for native stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")
Set-StrictMode -Off  # the helper turns StrictMode on in the dot-sourcing scope; this script never ran under it
$repo = (Invoke-WithUtf8Console { git rev-parse --show-toplevel }) -replace "/", "\"
$app  = "lobster-factory\infra\hetzner-phase1-core\apps\next-admin"
# Short root on purpose: this repo nests paths deep enough that a checkout under $env:TEMP hits the
# Windows 260-char limit and aborts mid-way ("Filename too long"), leaving a half-populated worktree.
$wtRoot = Join-Path ([System.IO.Path]::GetPathRoot($repo)) "Worktrees"
if (-not (Test-Path $wtRoot)) { New-Item -ItemType Directory -Path $wtRoot | Out-Null }
$wt   = Join-Path $wtRoot "headchk-$(Get-Random -Maximum 99999)"

$sha = (Invoke-WithUtf8Console { git -C $repo rev-parse --short $Ref })
Write-Host "[head-typecheck] ref=$Ref ($sha) -> $wt"

Invoke-WithUtf8Console { git -C $repo worktree add --detach --quiet $wt $Ref }
# git reports a failed checkout on stderr and returns non-zero; without this the script would run
# tsc in a half-populated tree and report whatever that happened to produce.
if ($LASTEXITCODE -ne 0) { throw "worktree checkout of $Ref failed -- see git output above" }
try {
  $appDir     = Join-Path $wt $app
  $wtLock     = Join-Path $appDir "package-lock.json"
  $srcModules = Join-Path $repo "$app\node_modules"
  if (-not (Test-Path $wtLock)) { throw "$Ref ($sha) has no $app\package-lock.json -- nothing declares a dependency set to check against" }

  if ($Install) {
    # Real install from the ref's own lockfile. No junction: the worktree gets its own tree, so
    # there is nothing to drift from and nothing to compare.
    Write-Host "[head-typecheck] -Install: npm ci --include=dev in the worktree (minutes)"
    Push-Location $appDir
    try {
      & npm ci --include=dev
      if ($LASTEXITCODE -ne 0) { throw "npm ci FAILED for $Ref ($sha) -- its lockfile does not install" }
    } finally { Pop-Location }
    Write-Host "[head-typecheck] npm ci OK"
  } else {
    if (-not (Test-Path $srcModules)) { throw "node_modules missing at $srcModules -- run npm install in $app first, or re-run with -Install" }
    # The comparison walks the real package directories, not npm's node_modules/.package-lock.json
    # index -- that index reports what npm believes it installed, so a directory deleted or edited
    # afterwards still reads as in sync (Codex review, 2026-09-23).
    $cmp = & node (Join-Path $repo "scripts\lib\compare-installed-deps.mjs") $wtLock $srcModules 2>&1
    $cmpExit = $LASTEXITCODE
    $cmp | ForEach-Object { Write-Host "[head-typecheck] $_" }
    if ($cmpExit -eq 2) { throw "dependency comparison could not run -- see message above" }
    if ($cmpExit -ne 0) {
      # Refusing, not installing: a silent install here would hide that the working copy and the
      # ref disagree, which is itself the thing worth knowing.
      throw "dependency drift between $Ref ($sha) and the installed tree in $app -- see the list above. tsc against this tree would report the WRONG answer for $Ref. Fix: npm ci in $app if the working copy is stale, or re-run with -Install to build the ref's own tree."
    }
    New-Item -ItemType Junction -Path (Join-Path $wt "$app\node_modules") -Target $srcModules | Out-Null
  }

  # .env.local is gitignored; next build reads it for public env vars. Absent = spurious failure.
  $env1 = Join-Path $repo "$app\.env.local"
  if (Test-Path $env1) { Copy-Item $env1 (Join-Path $wt "$app\.env.local") }

  if (-not (Test-Path (Join-Path $appDir "tsconfig.json"))) { throw "checkout incomplete: no tsconfig.json in $appDir" }
  Push-Location $appDir
  try {
    & npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { throw "tsc FAILED on $Ref ($sha) -- the committed tree does not typecheck" }
    Write-Host "[head-typecheck] tsc OK"

    if ($Build) {
      & npx next build
      if ($LASTEXITCODE -ne 0) { throw "next build FAILED on $Ref ($sha)" }
      Write-Host "[head-typecheck] next build OK"
    }
  } finally { Pop-Location }
} finally {
  if ($Keep) { Write-Host "[head-typecheck] worktree kept: $wt" }
  else {
    # rmdir, not Remove-Item: it deletes the reparse point only. Remove-Item -Recurse on a junction
    # has been known to follow it and delete the REAL node_modules. Skipped under -Install, where
    # that path is a real directory that worktree remove should delete normally.
    $junction = Join-Path $wt "$app\node_modules"
    if (-not $Install -and (Test-Path $junction)) { & cmd /c rmdir $junction 2>&1 | Out-Null }
    # Cleanup never changes the verdict. Under $ErrorActionPreference=Stop any native command
    # writing to stderr raises a TERMINATING error -- redirecting it does not help, it is the
    # error record itself that stops the block -- so drop to Continue for the whole teardown.
    # Without this, `git worktree remove` hitting "Filename too long" on an -Install tree turned a
    # green typecheck into exit 1 and skipped the fallback below (measured 2026-09-23).
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      Invoke-WithUtf8Console { & git -C $repo worktree remove --force $wt 2>&1 } | Out-Null
      if (Test-Path $wt) {
        # Existence is not the question -- under -Install that path is a real directory npm just
        # filled, and treating it as a junction left the whole tree behind. Ask for the reparse
        # point attribute itself.
        $junctionLive = (Test-Path $junction) -and
          (((Get-Item $junction -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
        if ($junctionLive) {
          # Never recurse into a live junction -- that is how the real node_modules gets deleted.
          Write-Host "[head-typecheck] WARNING: junction still present under $wt; not deleting recursively"
        } else {
          # -Install leaves a REAL node_modules, which nests past MAX_PATH; git gives up on it with
          # "failed to delete ...: Filename too long". The \\?\ prefix is the only way to remove
          # those paths. Reachable only with no junction inside $wt, per the check above.
          & cmd /c rmdir /s /q "\\?\$wt" 2>&1 | Out-Null
          Invoke-WithUtf8Console { & git -C $repo worktree prune 2>&1 } | Out-Null
        }
      }
      if (Test-Path $wt) { Write-Host "[head-typecheck] WARNING: scratch worktree left behind at $wt -- delete it manually" }
    } catch {
      Write-Host "[head-typecheck] WARNING: cleanup failed: $($_.Exception.Message)"
    } finally { $ErrorActionPreference = $prevEap }
  }
}
Write-Host "[head-typecheck] HEAD_TYPECHECK_OK ref=$Ref sha=$sha"
