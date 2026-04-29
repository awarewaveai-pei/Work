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

function Assert-NoMatch {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Message
  )

  $match = Select-String -LiteralPath $Path -Pattern $Pattern -SimpleMatch
  if ($match) {
    throw "$Message (file: $Path)"
  }
}

function Assert-Match {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Message
  )

  $match = Select-String -LiteralPath $Path -Pattern $Pattern -SimpleMatch
  if (-not $match) {
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

# Guardrail 2: deprecated latency_log must not exist in config override.
Assert-NoMatch -Path $resolvedClickHouseOverrideFile -Pattern '<latency_log>' -Message "Deprecated ClickHouse latency_log found"

# Guardrail 3: preflight checker service must remain present.
Assert-Match -Path $resolvedComposeFile -Pattern 'clickhouse-config-check:' -Message "clickhouse-config-check service missing"

# Guardrail 4: CLICKHOUSE_URL must stay parseable by Trigger webapp (no unknown query keys); CH 25.3+ needs no experimental_json_type in URL.
Assert-Match -Path $resolvedEnvExampleFile -Pattern 'CLICKHOUSE_URL=http://default:change_this_clickhouse_password@clickhouse:8123?secure=false' -Message "CLICKHOUSE_URL in .env.example must use ?secure=false (see README)"
Assert-Match -Path $resolvedEnvExampleFile -Pattern 'RUN_REPLICATION_CLICKHOUSE_URL=http://default:change_this_clickhouse_password@clickhouse:8123' -Message "RUN_REPLICATION_CLICKHOUSE_URL in .env.example must match documented base URL"

Write-Host "Trigger config validation passed." -ForegroundColor Green
