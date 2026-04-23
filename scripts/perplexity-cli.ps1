param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-ApiKey {
    $apiKey = [Environment]::GetEnvironmentVariable("PERPLEXITY_API_KEY", "Process")
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        $apiKey = [Environment]::GetEnvironmentVariable("PERPLEXITY_API_KEY", "User")
    }
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        throw "Missing PERPLEXITY_API_KEY."
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

function Invoke-PerplexityApi {
    param(
        [string]$Path,
        [string]$Body,
        [switch]$Json
    )

    $headers = @{
        Authorization = "Bearer $(Get-ApiKey)"
        "Content-Type" = "application/json"
    }

    $response = Invoke-RestMethod -Method Post -Uri ("https://api.perplexity.ai" + $Path) -Headers $headers -Body $Body
    if ($Json) {
        $response | ConvertTo-Json -Depth 20
        return
    }
    return $response
}

function Show-Usage {
    @"
Usage:
  perplexity help
  perplexity chat [options] <prompt>
  perplexity search [options] <query>
  perplexity agent [options] <input>
  perplexity embeddings [options] <text>
  perplexity raw --path /v1/... --body '{...}'
  perplexity raw --path /v1/... --body-file request.json

Commands:
  chat         Sonar API via POST /v1/sonar
  search       Search API via POST /search
  agent        Agent API via POST /v1/agent
  embeddings   Embeddings API via POST /v1/embeddings
  raw          Arbitrary official endpoint with custom JSON

Common options:
  --json
  --body-file <file>

Chat options:
  --model <model>                Default: sonar-pro
  --system <text>
  --max-tokens <n>
  --temperature <n>
  --reasoning-effort <level>
  --search-mode <web|academic|sec>
  --country <code>
  --domain <host>                Repeatable
  --lang <code>                  Repeatable
  --images
  --related
  --disable-search

Search options:
  --max-results <n>              Default: 10
  --max-tokens <n>               Default: 10000
  --max-tokens-per-page <n>      Default: 4096
  --country <code>
  --search-mode <web|academic|sec>
  --domain <host>                Repeatable
  --lang <code>                  Repeatable

Agent options:
  --body-file <file>             Recommended for complex requests
  --preset <name>
  --model <provider/model>

Embeddings options:
  --model <model>                Default: pplx-embed-v1-0.6b
  --dimensions <n>
  --encoding-format <base64_int8|base64_binary>
"@ | Write-Output
}

function Write-ChatOutput {
    param($Response)
    $content = $Response.choices[0].message.content
    if (-not [string]::IsNullOrWhiteSpace($content)) {
        Write-Output $content.Trim()
    }
    $citations = @($Response.citations)
    if ($citations.Count -gt 0) {
        Write-Output ""
        Write-Output "Sources:"
        foreach ($citation in $citations) {
            if (-not [string]::IsNullOrWhiteSpace([string]$citation)) {
                Write-Output "- $citation"
            }
        }
    }
}

function Write-SearchOutput {
    param($Response)
    foreach ($result in @($Response.results)) {
        Write-Output $result.title
        Write-Output $result.url
        if ($result.date) {
            Write-Output ("Date: " + $result.date)
        }
        if ($result.snippet) {
            Write-Output $result.snippet
        }
        Write-Output ""
    }
}

function Write-AgentOutput {
    param($Response)
    if ($Response.output_text) {
        Write-Output $Response.output_text.Trim()
        return
    }

    foreach ($item in @($Response.output)) {
        if ($item.type -eq "message") {
            foreach ($content in @($item.content)) {
                if ($content.type -eq "output_text" -and $content.text) {
                    Write-Output $content.text.Trim()
                }
            }
        }
    }
}

function Write-EmbeddingsOutput {
    param($Response)
    foreach ($item in @($Response.data)) {
        if ($item.embedding) {
            Write-Output ($item.embedding | ConvertTo-Json -Depth 10)
        } else {
            Write-Output ($item | ConvertTo-Json -Depth 10)
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
        $model = "sonar-pro"
        $system = ""
        $maxTokens = $null
        $temperature = $null
        $reasoningEffort = ""
        $searchMode = ""
        $country = ""
        $domains = New-Object System.Collections.Generic.List[string]
        $langs = New-Object System.Collections.Generic.List[string]
        $returnImages = $false
        $returnRelated = $false
        $disableSearch = $false
        $promptParts = New-Object System.Collections.Generic.List[string]

        for ($i = 0; $i -lt $rest.Count; $i++) {
            $arg = $rest[$i]
            switch ($arg) {
                "--json" { $json = $true; continue }
                "--model" { $i++; $model = $rest[$i]; continue }
                "--system" { $i++; $system = $rest[$i]; continue }
                "--max-tokens" { $i++; $maxTokens = [int]$rest[$i]; continue }
                "--temperature" { $i++; $temperature = [double]$rest[$i]; continue }
                "--reasoning-effort" { $i++; $reasoningEffort = $rest[$i]; continue }
                "--search-mode" { $i++; $searchMode = $rest[$i]; continue }
                "--country" { $i++; $country = $rest[$i]; continue }
                "--domain" { $i++; $domains.Add($rest[$i]); continue }
                "--lang" { $i++; $langs.Add($rest[$i]); continue }
                "--images" { $returnImages = $true; continue }
                "--related" { $returnRelated = $true; continue }
                "--disable-search" { $disableSearch = $true; continue }
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

        $webSearch = @{}
        if (-not [string]::IsNullOrWhiteSpace($searchMode)) { $webSearch.search_mode = $searchMode }
        if (-not [string]::IsNullOrWhiteSpace($country)) { $webSearch.country = $country }
        if ($domains.Count -gt 0) { $webSearch.search_domain_filter = @($domains) }
        if ($langs.Count -gt 0) { $webSearch.search_language_filter = @($langs) }
        if ($returnImages) { $body.return_images = $true }
        if ($returnRelated) { $body.return_related_questions = $true }
        if ($disableSearch) { $webSearch.disable_search = $true }
        if ($maxTokens -ne $null) { $body.max_tokens = $maxTokens }
        if ($temperature -ne $null) { $body.temperature = $temperature }
        if (-not [string]::IsNullOrWhiteSpace($reasoningEffort)) { $body.reasoning_effort = $reasoningEffort }
        if ($webSearch.Count -gt 0) { $body.web_search_options = $webSearch }

        $response = Invoke-PerplexityApi -Path "/v1/sonar" -Body ($body | ConvertTo-Json -Depth 10) -Json:$json
        if (-not $json) { Write-ChatOutput -Response $response }
        exit 0
    }
    "search" {
        $maxResults = 10
        $maxTokens = 10000
        $maxTokensPerPage = 4096
        $country = ""
        $searchMode = ""
        $domains = New-Object System.Collections.Generic.List[string]
        $langs = New-Object System.Collections.Generic.List[string]
        $queryParts = New-Object System.Collections.Generic.List[string]

        for ($i = 0; $i -lt $rest.Count; $i++) {
            $arg = $rest[$i]
            switch ($arg) {
                "--json" { $json = $true; continue }
                "--max-results" { $i++; $maxResults = [int]$rest[$i]; continue }
                "--max-tokens" { $i++; $maxTokens = [int]$rest[$i]; continue }
                "--max-tokens-per-page" { $i++; $maxTokensPerPage = [int]$rest[$i]; continue }
                "--country" { $i++; $country = $rest[$i]; continue }
                "--search-mode" { $i++; $searchMode = $rest[$i]; continue }
                "--domain" { $i++; $domains.Add($rest[$i]); continue }
                "--lang" { $i++; $langs.Add($rest[$i]); continue }
                default { $queryParts.Add($arg); continue }
            }
        }

        $query = Read-InputText -Parts $queryParts
        if ([string]::IsNullOrWhiteSpace($query)) {
            throw "Query is required."
        }

        $body = @{
            query = $query
            max_results = $maxResults
            max_tokens = $maxTokens
            max_tokens_per_page = $maxTokensPerPage
        }
        if (-not [string]::IsNullOrWhiteSpace($country)) { $body.country = $country }
        if (-not [string]::IsNullOrWhiteSpace($searchMode)) { $body.search_mode = $searchMode }
        if ($domains.Count -gt 0) { $body.search_domain_filter = @($domains) }
        if ($langs.Count -gt 0) { $body.search_language_filter = @($langs) }

        $response = Invoke-PerplexityApi -Path "/search" -Body ($body | ConvertTo-Json -Depth 10) -Json:$json
        if (-not $json) { Write-SearchOutput -Response $response }
        exit 0
    }
    "agent" {
        $model = ""
        $preset = ""
        $bodyFile = ""
        $inputParts = New-Object System.Collections.Generic.List[string]

        for ($i = 0; $i -lt $rest.Count; $i++) {
            $arg = $rest[$i]
            switch ($arg) {
                "--json" { $json = $true; continue }
                "--model" { $i++; $model = $rest[$i]; continue }
                "--preset" { $i++; $preset = $rest[$i]; continue }
                "--body-file" { $i++; $bodyFile = $rest[$i]; continue }
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
            $payload = @{ input = $inputText }
            if (-not [string]::IsNullOrWhiteSpace($model)) { $payload.model = $model }
            if (-not [string]::IsNullOrWhiteSpace($preset)) { $payload.preset = $preset }
            $body = $payload | ConvertTo-Json -Depth 20
        }

        $response = Invoke-PerplexityApi -Path "/v1/agent" -Body $body -Json:$json
        if (-not $json) { Write-AgentOutput -Response $response }
        exit 0
    }
    "embeddings" {
        $model = "pplx-embed-v1-0.6b"
        $dimensions = $null
        $encodingFormat = ""
        $bodyFile = ""
        $inputParts = New-Object System.Collections.Generic.List[string]

        for ($i = 0; $i -lt $rest.Count; $i++) {
            $arg = $rest[$i]
            switch ($arg) {
                "--json" { $json = $true; continue }
                "--model" { $i++; $model = $rest[$i]; continue }
                "--dimensions" { $i++; $dimensions = [int]$rest[$i]; continue }
                "--encoding-format" { $i++; $encodingFormat = $rest[$i]; continue }
                "--body-file" { $i++; $bodyFile = $rest[$i]; continue }
                default { $inputParts.Add($arg); continue }
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($bodyFile)) {
            $body = Read-JsonFile -Path $bodyFile
        } else {
            $inputText = Read-InputText -Parts $inputParts
            if ([string]::IsNullOrWhiteSpace($inputText)) {
                throw "Input text is required."
            }
            $payload = @{
                input = $inputText
                model = $model
            }
            if ($dimensions -ne $null) { $payload.dimensions = $dimensions }
            if (-not [string]::IsNullOrWhiteSpace($encodingFormat)) { $payload.encoding_format = $encodingFormat }
            $body = $payload | ConvertTo-Json -Depth 20
        }

        $response = Invoke-PerplexityApi -Path "/v1/embeddings" -Body $body -Json:$json
        if (-not $json) { Write-EmbeddingsOutput -Response $response }
        exit 0
    }
    "raw" {
        $path = ""
        $body = ""
        $bodyFile = ""

        for ($i = 0; $i -lt $rest.Count; $i++) {
            $arg = $rest[$i]
            switch ($arg) {
                "--json" { $json = $true; continue }
                "--path" { $i++; $path = $rest[$i]; continue }
                "--body" { $i++; $body = $rest[$i]; continue }
                "--body-file" { $i++; $bodyFile = $rest[$i]; continue }
                default { throw "Unknown raw option: $arg" }
            }
        }

        if ([string]::IsNullOrWhiteSpace($path)) {
            throw "--path is required."
        }
        if (-not [string]::IsNullOrWhiteSpace($bodyFile)) {
            $body = Read-JsonFile -Path $bodyFile
        }
        if ([string]::IsNullOrWhiteSpace($body)) {
            throw "Either --body or --body-file is required."
        }

        $response = Invoke-PerplexityApi -Path $path -Body $body -Json:$json
        if (-not $json) {
            $response | ConvertTo-Json -Depth 20
        }
        exit 0
    }
    default {
        throw "Unknown command: $command. Run 'perplexity help'."
    }
}
