# Shared helpers for system-health-check reports (JSON + Markdown).
# Dot-source from ao-close.ps1 / system-guard.ps1: . (Join-Path $PSScriptRoot "health-report-utils.ps1")

function Get-LatestHealthScorePercent {
    param(
        [Parameter(Mandatory = $true)][string]$HealthDir
    )
    if (-not (Test-Path -LiteralPath $HealthDir)) {
        return $null
    }
    $jsonFiles = @(Get-ChildItem -LiteralPath $HealthDir -Filter "health-*.json" -File -ErrorAction SilentlyContinue)
    $mdFiles = @(Get-ChildItem -LiteralPath $HealthDir -Filter "health-*.md" -File -ErrorAction SilentlyContinue)
    $latestJson = $jsonFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    $latestMd = $mdFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1

    $preferJson = $false
    if ($latestJson -and $latestMd) {
        $preferJson = ($latestJson.LastWriteTimeUtc -ge $latestMd.LastWriteTimeUtc)
    } elseif ($latestJson) {
        $preferJson = $true
    }

    if ($preferJson -and $latestJson) {
        try {
            $j = Get-Content -LiteralPath $latestJson.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($null -ne $j.PSObject.Properties["schemaVersion"] -and $null -ne $j.PSObject.Properties["score"]) {
                return [double]$j.score
            }
            if ($j -is [System.Collections.IEnumerable] -and $j -isnot [string]) {
                $arr = @($j)
                if ($arr.Count -gt 0 -and $arr[0].PSObject.Properties["pass"]) {
                    $p = @($arr | Where-Object { $_.pass }).Count
                    return [Math]::Round(100.0 * $p / $arr.Count, 1)
                }
            }
        } catch {
            # fall through to markdown
        }
    }

    if ($latestMd) {
        $text = Get-Content -LiteralPath $latestMd.FullName -Raw -Encoding UTF8
        $m = [regex]::Match($text, 'Score:\s*\*\*([0-9]+(?:\.[0-9]+)?)%')
        if ($m.Success) {
            return [double]$m.Groups[1].Value
        }
    }
    return $null
}
