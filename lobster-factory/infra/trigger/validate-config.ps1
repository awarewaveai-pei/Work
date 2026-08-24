param(
  [string]$ComposeFile = "docker-compose.yml",
  [string]$EnvExampleFile = ".env.example",
  [string]$ClickHouseOverrideFile = "clickhouse/override.xml"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-ScriptRelativePath {
  param([string]$Path)

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return $Path
  }

  return Join-Path -Path $PSScriptRoot -ChildPath $Path
}

function Assert-FileExists {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Required file not found: $Path"
  }
}

function Get-FileTextUtf8 {
  param([string]$Path)

  # Read as UTF-8 EXPLICITLY. PowerShell 5.1's Get-Content and Select-String decode with the
  # console ANSI code page - CP950 on this machine - and a CJK byte sequence can swallow the
  # newline that follows it. Measured 2026-08-25 on .env.example (which carries a Chinese
  # comment): the default decode yields 102 newlines where the file really has 119, and 5423
  # characters where UTF-8 gives 4951.
  #
  # That is not cosmetic. It breaks '^' anchors for every line after a CJK one, and - worse
  # for this file - it can make a literal Assert-NoMatch pattern unfindable, so the guard
  # passes because it has gone blind rather than because the repo is clean. A gate that
  # cannot see must never look like a gate that found nothing.
  # (Same trap class as scripts/audit-cp950-traps.ps1 audits for in command output.)
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Assert-NoMatch {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Message
  )

  if ((Get-FileTextUtf8 -Path $Path).Contains($Pattern)) {
    throw "$Message (file: $Path)"
  }
}

function Assert-Match {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Message
  )

  if (-not (Get-FileTextUtf8 -Path $Path).Contains($Pattern)) {
    throw "$Message (file: $Path)"
  }
}

$resolvedComposeFile = Resolve-ScriptRelativePath -Path $ComposeFile
$resolvedEnvExampleFile = Resolve-ScriptRelativePath -Path $EnvExampleFile
$resolvedClickHouseOverrideFile = Resolve-ScriptRelativePath -Path $ClickHouseOverrideFile

Assert-FileExists -Path $resolvedComposeFile
Assert-FileExists -Path $resolvedEnvExampleFile
Assert-FileExists -Path $resolvedClickHouseOverrideFile

# Guardrail 1: never use floating ClickHouse tags in trigger compose defaults.
Assert-NoMatch -Path $resolvedComposeFile -Pattern 'bitnamilegacy/clickhouse:${CLICKHOUSE_IMAGE_TAG:-latest}' -Message "Floating ClickHouse tag is not allowed"
Assert-NoMatch -Path $resolvedEnvExampleFile -Pattern 'CLICKHOUSE_IMAGE_TAG=latest' -Message "Floating CLICKHOUSE_IMAGE_TAG in .env.example is not allowed"

# Guardrail 1b: the tag is written in two places (compose default and .env.example) and read
# by a third (clickhouse/validate-override.sh, which boots that image to validate the config).
# If they disagree, the validator can PASS against a build that is not the one deployed - an
# answer that looks authoritative and is about the wrong software.
$composeTag = ([regex]::Match((Get-FileTextUtf8 -Path $resolvedComposeFile), 'bitnamilegacy/clickhouse:\$\{CLICKHOUSE_IMAGE_TAG:-([^}]+)\}')).Groups[1].Value
$envExampleTag = ([regex]::Match((Get-FileTextUtf8 -Path $resolvedEnvExampleFile), '(?m)^\s*CLICKHOUSE_IMAGE_TAG\s*=\s*([^\s#]+)')).Groups[1].Value
if (-not $composeTag) { throw "Could not read the ClickHouse image tag default from $resolvedComposeFile" }
if (-not $envExampleTag) { throw "Could not read CLICKHOUSE_IMAGE_TAG from $resolvedEnvExampleFile" }
if ($composeTag -ne $envExampleTag) {
  throw "ClickHouse image tag disagrees: docker-compose.yml default '$composeTag' vs .env.example '$envExampleTag' - clickhouse/validate-override.sh would validate against the wrong build"
}
# AGENTS.md pins the 25.7.x line; 24.x and latest are forbidden.
if ($composeTag -notmatch '^25\.7\.') {
  throw "ClickHouse image tag '$composeTag' is off the pinned 25.7.x line (AGENTS.md forbids 24.x and latest)"
}

# Guardrail 2 (was: "deprecated latency_log must not exist") - REMOVED 2026-08-25.
#
# That guardrail was added 2026-04-29 for ClickHouse 24.8, where latency_log did not
# exist. On the pinned 25.7.x line it is a normal system log table: it is present on the
# EU instance (9.72 MiB, carrying the TTL this override declares) and a disposable 25.7.5
# container accepts the declaration without complaint.
#
# The 2026-08-15 incident fix legitimately added <latency_log> back to override.xml, and
# from that moment this script threw on every run. It runs in CI
# (.github/workflows/trigger-infra-config-guard.yml, on every push touching
# lobster-factory/infra/trigger/**), so the guard went red on 2026-08-15 08:04:50Z - on
# the very commit that fixed the previous ClickHouse incident - and stayed red for four
# consecutive runs across ten days. Nobody looked. A guard nobody reads is not a guard,
# and a stale assertion is worse than none because it trains people to ignore the signal.
# Do not re-add a version-specific "table X must not exist" rule here: assert invariants
# that stay true across versions, and let validate-override.sh check what only a running
# server can answer.

# Guardrail 3: the retired generators must stay retired. Each of these was removed because
# it floods (trace_log, asynchronous_metric_log) or because it is too wide to merge inside
# the container's memory budget (metric_log 1,344 columns, query_metric_log 939), or has no
# writer in this stack (query_thread_log, s3queue_log). Deleting one of these lines silently
# re-enables a generator that has already caused an outage, so it is guarded textually here
# and behaviourally in validate-override.sh.
foreach ($retired in @("trace_log", "asynchronous_metric_log", "metric_log", "query_metric_log", "query_thread_log", "s3queue_log")) {
  Assert-Match -Path $resolvedClickHouseOverrideFile -Pattern ('<{0} remove="1"/>' -f $retired) -Message "Retired ClickHouse generator '$retired' is no longer disabled in override.xml"
}

# Guardrail 4: background merges must keep a memory bound, AT THE DERIVED VALUE.
# The first version of this guardrail only asserted the tag existed and was not 0, while the
# surrounding documentation described the budget as mechanically locked - so 64 MiB or 2 GiB
# would both have passed silently (codex oracle 2026-08-25 round 2, FINDING 2 - confirmed).
# 1073741824 = 1 GiB is not arbitrary: it is solved from base RSS (~0.9 GiB) plus the merge
# allowance staying under max_server_memory_usage (2.5 GiB). Changing it invalidates that
# arithmetic, which is exactly when a human should have to come here and redo it.
Assert-Match -Path $resolvedClickHouseOverrideFile -Pattern '<merges_mutations_memory_usage_soft_limit>1073741824</merges_mutations_memory_usage_soft_limit>' -Message "merge memory budget changed (or is 0/unlimited) - re-derive the MERGE MEMORY BUDGET section of override.xml, then update this guardrail and clickhouse/validate-override.sh in the same commit"

# Guardrail 5: the memory cap is a budget, not a dial. Four of the five ClickHouse
# incidents on this host were "fixed" by raising a ceiling. Everything in override.xml is
# sized to fit inside this number, so changing it invalidates that arithmetic - which is
# exactly the moment a human should have to come here and re-derive it deliberately.
Assert-Match -Path $resolvedClickHouseOverrideFile -Pattern '<max_server_memory_usage>2684354560</max_server_memory_usage>' -Message "max_server_memory_usage changed - re-derive the MERGE MEMORY BUDGET section of override.xml, then update this guardrail in the same commit"

# Guardrail 5b: the cgroup limit the budget is derived from. override.xml's 2.5 GiB cap
# exists to sit ~512 MiB under the container's 3072m, so the two numbers are one decision
# and must move together.
# This is not hypothetical drift-proofing. From 2026-06-13 to 2026-08-25 this file said
# 4096m while production ran 3072m: an uncommitted working-tree edit was swept into the
# repo by an auto-checkpoint commit and never deployed, so the SSOT disagreed with reality
# for ten weeks and every memory argument written in that window rested on the wrong
# number. Nothing compared them until this guardrail existed.
Assert-Match -Path $resolvedComposeFile -Pattern 'mem_limit: 3072m' -Message "clickhouse mem_limit is no longer 3072m - override.xml's memory budget is derived from it; update both files and this guardrail together"

# Guardrail 6: text_log must keep capturing Error-level messages. This is a coupling
# introduced on 2026-08-25 and it is easy to break by accident: the merge-failure probe in
# scripts/check-clickhouse-health.ps1 counts Error rows logged by MergeTreeBackgroundExecutor,
# so raising this level above 'error' would leave that probe reading a silent zero - a
# detector that has gone blind while looking exactly like a healthy system, which is the
# specific failure shape AGENTS.md forbids. 'warning' keeps Error in scope with margin.
Assert-Match -Path $resolvedClickHouseOverrideFile -Pattern '<level>warning</level>' -Message "text_log level is no longer 'warning' - the merge-failure detector in check-clickhouse-health.ps1 reads Error rows from text_log and would silently report zero"

# Guardrail 7: the behavioural validator must remain present. It is the only check that can
# catch a config the server refuses to start with - see its header for why the
# clickhouse-config-check compose service it replaced never worked.
Assert-FileExists -Path (Resolve-ScriptRelativePath -Path "clickhouse/validate-override.sh")

# Guardrail 4: CLICKHOUSE_URL must stay parseable by Trigger webapp (no unknown query keys); CH 25.3+ needs no experimental_json_type in URL.
Assert-Match -Path $resolvedEnvExampleFile -Pattern 'CLICKHOUSE_URL=http://default:change_this_clickhouse_password@clickhouse:8123?secure=false' -Message "CLICKHOUSE_URL in .env.example must use ?secure=false (see README)"
Assert-Match -Path $resolvedEnvExampleFile -Pattern 'RUN_REPLICATION_CLICKHOUSE_URL=http://default:change_this_clickhouse_password@clickhouse:8123' -Message "RUN_REPLICATION_CLICKHOUSE_URL in .env.example must match documented base URL"

Write-Host "Trigger config validation passed." -ForegroundColor Green
