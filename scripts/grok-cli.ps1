param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-XaiApiKey {
    $apiKey = [Environment]::GetEnvironmentVariable("XAI_API_KEY", "Process")
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        $apiKey = [Environment]::GetEnvironmentVariable("XAI_API_KEY", "User")
    }
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        throw "Missing XAI_API_KEY."
    }
    return $apiKey
}

function Read-JsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File not found: $Path"
    }
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8
}

function Read-InputText {
    param([string[]]$Parts)
    $text = ($Parts -join " ").Trim()
    if ([Console]::IsInputRedirected) {
        $stdin = [Console]::In.ReadToEnd().Trim()
        if (-not [string]::IsNullOrWhiteSpace($stdin)) {
            if ([string]::IsNullOrWhiteSpace($text)) {
                $text = $stdin
            } else {
                $text = "$stdin`n$text".Trim()
            }
        }
    }
    return $text
}

function Invoke-XaiPost {
    param(
        [string]$Path,
        [string]$Body
    )

    $headers = @{
        Authorization = "Bearer $(Get-XaiApiKey)"
        "Content-Type" = "application/json"
    }

    return Invoke-RestMethod -Method Post -Uri ("https://api.x.ai" + $Path) -Headers $headers -Body $Body
}

function Invoke-XaiGet {
    param([string]$Path)
    $headers = @{
        Authorization = "Bearer $(Get-XaiApiKey)"
    }
    return Invoke-RestMethod -Method Get -Uri ("https://api.x.ai" + $Path) -Headers $headers
}

function Invoke-XaiDelete {
    param([string]$Path)
    $headers = @{
        Authorization = "Bearer $(Get-XaiApiKey)"
    }
    return Invoke-RestMethod -Method Delete -Uri ("https://api.x.ai" + $Path) -Headers $headers
}

function Show-Usage {
    @"
Usage:
  grok help
  grok chat [options] <prompt>
  grok responses [options] <input>
  grok models
  grok get-response <response_id>
  grok delete-response <response_id>
  grok templates
  grok raw --method <GET|POST|DELETE> --path /v1/... [--body '{...}' | --body-file req.json]

Commands:
  chat            POST /v1/chat/completions
  responses       POST /v1/responses
  models          GET  /v1/models
  get-response    GET  /v1/responses/{id}
  delete-response DELETE /v1/responses/{id}
  templates       Show example request templates
  raw             Arbitrary xAI REST call

Chat options:
  --model <model>         Default: grok-4.20-reasoning
  --system <text>
  --temperature <n>
  --max-tokens <n>
  --json

Responses options:
  --model <model>         Default: grok-4.20-reasoning
  --json
  --body-file <file>      Recommended for tool-heavy agent requests
  --web-search            Add built-in web_search tool
  --tool-choice <value>   auto | required | none

Examples:
  grok chat "Summarize today's xAI announcements"
  grok responses "Plan a migration from Cursor MCP to shared registry"
  grok responses --web-search "Find today's top xAI and OpenAI product updates"
  grok raw --method POST --path /v1/responses --body-file .\examples\xai-web-search-template.json
  grok raw --method POST --path /v1/responses --body-file .\xai-agent.json
"@ | Write-Output
}

function Write-ChatOutput {
    param($Response)
    $content = $Response.choices[0].message.content
    if (-not [string]::IsNullOrWhiteSpace([string]$content)) {
        Write-Output $content.Trim()
    } else {
        $Response | ConvertTo-Json -Depth 20
    }
}

function Write-ResponsesOutput {
    param($Response)
    if ($Response.output_text) {
        Write-Output $Response.output_text.Trim()
        return
    }

    foreach ($item in @($Response.output)) {
        foreach ($content in @($item.content)) {
            if ($content.text) {
                Write-Output $content.text.Trim()
            }
        }
    }
}

if (-not $Args -or $Args.Count -eq 0 -or $Args[0] -in @("help", "--help", "-h")) {
    Show-Usage
    exit 0
}

$command = $Args[0].ToLowerInvariant()
$rest = @($Args | Select-Object -Skip 1)
$json = $false

switch ($command) {
    "chat" {
        $model = "grok-4.20-reasoning"
        $system = ""
        $temperature = $null
        $maxTokens = $null
        $promptParts = New-Object System.Collections.Generic.List[string]

        for ($i = 0; $i -lt $rest.Count; $i++) {
            $arg = $rest[$i]
            switch ($arg) {
                "--json" { $json = $true; continue }
                "--model" { $i++; $model = $rest[$i]; continue }
                "--system" { $i++; $system = $rest[$i]; continue }
                "--temperature" { $i++; $temperature = [double]$rest[$i]; continue }
                "--max-tokens" { $i++; $maxTokens = [int]$rest[$i]; continue }
                default { $promptParts.Add($arg); continue }
            }
        }

        $prompt = Read-InputText -Parts $promptParts
        if ([string]::IsNullOrWhiteSpace($prompt)) {
            throw "Prompt is required."
        }

        $messages = @()
        if (-not [string]::IsNullOrWhiteSpace($system)) {
            $messages += @{ role = "system"; content = $system }
        }
        $messages += @{ role = "user"; content = $prompt }

        $body = @{
            model = $model
            messages = $messages
        }
        if ($temperature -ne $null) { $body.temperature = $temperature }
        if ($maxTokens -ne $null) { $body.max_tokens = $maxTokens }

        $response = Invoke-XaiPost -Path "/v1/chat/completions" -Body ($body | ConvertTo-Json -Depth 10)
        if ($json) {
            $response | ConvertTo-Json -Depth 20
        } else {
            Write-ChatOutput -Response $response
        }
        exit 0
    }
    "responses" {
        $model = "grok-4.20-reasoning"
        $bodyFile = ""
        $webSearch = $false
        $toolChoice = ""
        $inputParts = New-Object System.Collections.Generic.List[string]

        for ($i = 0; $i -lt $rest.Count; $i++) {
            $arg = $rest[$i]
            switch ($arg) {
                "--json" { $json = $true; continue }
                "--model" { $i++; $model = $rest[$i]; continue }
                "--body-file" { $i++; $bodyFile = $rest[$i]; continue }
                "--web-search" { $webSearch = $true; continue }
                "--tool-choice" { $i++; $toolChoice = $rest[$i]; continue }
                default { $inputParts.Add($arg); continue }
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($bodyFile)) {
            $body = Read-JsonFile -Path $bodyFile
        } else {
            $inputText = Read-InputText -Parts $inputParts
            if ([string]::IsNullOrWhiteSpace($inputText)) {
                throw "Input is required."
            }
            $body = @{
                model = $model
                input = $inputText
            }
            if ($webSearch) {
                $body.tools = @(
                    @{
                        type = "web_search"
                    }
                )
            }
            if (-not [string]::IsNullOrWhiteSpace($toolChoice)) {
                $body.tool_choice = $toolChoice
            }
            $body = $body | ConvertTo-Json -Depth 20
        }

        $response = Invoke-XaiPost -Path "/v1/responses" -Body $body
        if ($json) {
            $response | ConvertTo-Json -Depth 20
        } else {
            Write-ResponsesOutput -Response $response
        }
        exit 0
    }
    "templates" {
        Write-Output "Templates:"
        Write-Output "- C:\Users\USER\Work\examples\xai-web-search-template.json"
        Write-Output "- C:\Users\USER\Work\examples\xai-function-calling-template.json"
        exit 0
    }
    "models" {
        $response = Invoke-XaiGet -Path "/v1/models"
        $response | ConvertTo-Json -Depth 20
        exit 0
    }
    "get-response" {
        if ($rest.Count -lt 1) {
            throw "response_id is required."
        }
        $response = Invoke-XaiGet -Path ("/v1/responses/" + $rest[0])
        $response | ConvertTo-Json -Depth 20
        exit 0
    }
    "delete-response" {
        if ($rest.Count -lt 1) {
            throw "response_id is required."
        }
        $response = Invoke-XaiDelete -Path ("/v1/responses/" + $rest[0])
        $response | ConvertTo-Json -Depth 20
        exit 0
    }
    "raw" {
        $method = ""
        $path = ""
        $body = ""
        $bodyFile = ""

        for ($i = 0; $i -lt $rest.Count; $i++) {
            $arg = $rest[$i]
            switch ($arg) {
                "--method" { $i++; $method = $rest[$i].ToUpperInvariant(); continue }
                "--path" { $i++; $path = $rest[$i]; continue }
                "--body" { $i++; $body = $rest[$i]; continue }
                "--body-file" { $i++; $bodyFile = $rest[$i]; continue }
                default { throw "Unknown raw option: $arg" }
            }
        }

        if ([string]::IsNullOrWhiteSpace($method) -or [string]::IsNullOrWhiteSpace($path)) {
            throw "--method and --path are required."
        }

        if (-not [string]::IsNullOrWhiteSpace($bodyFile)) {
            $body = Read-JsonFile -Path $bodyFile
        }

        if ($method -eq "GET") {
            $response = Invoke-XaiGet -Path $path
        } elseif ($method -eq "DELETE") {
            $response = Invoke-XaiDelete -Path $path
        } elseif ($method -eq "POST") {
            if ([string]::IsNullOrWhiteSpace($body)) {
                throw "POST requires --body or --body-file."
            }
            $response = Invoke-XaiPost -Path $path -Body $body
        } else {
            throw "Unsupported method: $method"
        }

        $response | ConvertTo-Json -Depth 20
        exit 0
    }
    default {
        throw "Unknown command: $command. Run 'grok help'."
    }
}
