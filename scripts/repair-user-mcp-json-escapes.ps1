<#
.SYNOPSIS
  Fix Windows paths in %USERPROFILE%\.cursor\mcp.json that were written with single backslashes
  inside JSON strings (invalid JSON, breaks MCP / n8n display).
#>
param(
    [string]$UserMcpPath = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($UserMcpPath)) {
    $UserMcpPath = Join-Path $env:USERPROFILE ".cursor\mcp.json"
}
if (-not (Test-Path -LiteralPath $UserMcpPath)) {
    throw "User MCP file not found: $UserMcpPath"
}

$s = [System.IO.File]::ReadAllText($UserMcpPath)
if ($s.Length -gt 0 -and [int][char]$s[0] -eq 0xFEFF) {
    $s = $s.Substring(1)
}

$pairs = @(
    @("c:\Users\USER\Work/scripts/start-trigger-mcp.ps1", "c:\\Users\\USER\\Work/scripts/start-trigger-mcp.ps1"),
    @("c:\Users\USER\Work/scripts/run-llm-mcp.ps1", "c:\\Users\\USER\\Work/scripts/run-llm-mcp.ps1"),
    @("C:\Users\USER", "C:\\Users\\USER"),
    @("c:\Users\USER\Work", "c:\\Users\\USER\\Work")
)
foreach ($m in $pairs) {
    $s = $s.Replace(('"' + $m[0] + '"'), ('"' + $m[1] + '"'))
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($UserMcpPath, $s, $utf8NoBom)
Write-Host "Repaired JSON escapes (if any matched): $UserMcpPath" -ForegroundColor Green
