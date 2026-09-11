<#
.SYNOPSIS
  Typecheck the COMMITTED tree, not the working tree.

.DESCRIPTION
  Shared-worktree failure mode (2026-09-11, commit 656216805): a pathspec commit took a file that
  imported a type another concurrent session had only written locally. Local `tsc --noEmit` stayed
  green because the local tree had that declaration; HEAD did not build at all. Nothing caught it,
  because every gate we own inspects the working tree.

  Invariant enforced here: every commit's tree must typecheck on its own. Checks out a ref into a
  detached worktree, junctions the existing node_modules (install would take minutes and prove
  nothing extra), runs tsc there.

.PARAMETER Ref      git ref to check. Default HEAD.
.PARAMETER Build    also run `next build` (slower; catches route/runtime-level failures too).
.PARAMETER Keep     keep the scratch worktree for inspection instead of removing it.
#>
param(
  [string]$Ref = "HEAD",
  [switch]$Build,
  [switch]$Keep
)

$ErrorActionPreference = "Stop"
$repo = (git rev-parse --show-toplevel) -replace "/", "\"
$app  = "lobster-factory\infra\hetzner-phase1-core\apps\next-admin"
# Short root on purpose: this repo nests paths deep enough that a checkout under $env:TEMP hits the
# Windows 260-char limit and aborts mid-way ("Filename too long"), leaving a half-populated worktree.
$wtRoot = Join-Path ([System.IO.Path]::GetPathRoot($repo)) "Worktrees"
if (-not (Test-Path $wtRoot)) { New-Item -ItemType Directory -Path $wtRoot | Out-Null }
$wt   = Join-Path $wtRoot "headchk-$(Get-Random -Maximum 99999)"

$sha = (git -C $repo rev-parse --short $Ref)
Write-Host "[head-typecheck] ref=$Ref ($sha) -> $wt"

git -C $repo worktree add --detach --quiet $wt $Ref
# git reports a failed checkout on stderr and returns non-zero; without this the script would run
# tsc in a half-populated tree and report whatever that happened to produce.
if ($LASTEXITCODE -ne 0) { throw "worktree checkout of $Ref failed -- see git output above" }
try {
  $srcModules = Join-Path $repo "$app\node_modules"
  if (-not (Test-Path $srcModules)) { throw "node_modules missing at $srcModules -- run npm install in $app first" }
  New-Item -ItemType Junction -Path (Join-Path $wt "$app\node_modules") -Target $srcModules | Out-Null

  # .env.local is gitignored; next build reads it for public env vars. Absent = spurious failure.
  $env1 = Join-Path $repo "$app\.env.local"
  if (Test-Path $env1) { Copy-Item $env1 (Join-Path $wt "$app\.env.local") }

  $appDir = Join-Path $wt $app
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
    # has been known to follow it and delete the REAL node_modules.
    & cmd /c rmdir (Join-Path $wt "$app\node_modules") 2>$null
    git -C $repo worktree remove --force $wt 2>$null
  }
}
Write-Host "[head-typecheck] HEAD_TYPECHECK_OK ref=$Ref sha=$sha"
