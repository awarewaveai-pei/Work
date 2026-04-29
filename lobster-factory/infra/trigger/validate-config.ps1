param(
  [string]$ComposeFile = "docker-compose.yml",
  [string]$EnvExampleFile = ".env.example",
  [string]$ClickHouseOverrideFile = "clickhouse/override.xml"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

Assert-FileExists -Path $ComposeFile
Assert-FileExists -Path $EnvExampleFile
Assert-FileExists -Path $ClickHouseOverrideFile

# Guardrail 1: never use floating ClickHouse tags in trigger compose defaults.
Assert-NoMatch -Path $ComposeFile -Pattern 'bitnamilegacy/clickhouse:${CLICKHOUSE_IMAGE_TAG:-latest}' -Message "Floating ClickHouse tag is not allowed"
Assert-NoMatch -Path $EnvExampleFile -Pattern 'CLICKHOUSE_IMAGE_TAG=latest' -Message "Floating CLICKHOUSE_IMAGE_TAG in .env.example is not allowed"

# Guardrail 2: deprecated latency_log must not exist in config override.
Assert-NoMatch -Path $ClickHouseOverrideFile -Pattern '<latency_log>' -Message "Deprecated ClickHouse latency_log found"

# Guardrail 3: preflight checker service must remain present.
Assert-Match -Path $ComposeFile -Pattern 'clickhouse-config-check:' -Message "clickhouse-config-check service missing"

Write-Host "Trigger config validation passed." -ForegroundColor Green
