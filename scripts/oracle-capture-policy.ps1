# Shared capture policy for both cross-model oracle wrappers.
# Keep this file PowerShell 5.1 compatible: it is loaded by Claude and Codex paths.

Set-StrictMode -Version Latest

function Get-OracleCapturePolicy {
    return [ordered]@{
        # A review packet is an input envelope, not an archive.  Refuse before
        # invoking an external model when the envelope is unexpectedly large.
        MaxPacketBytes       = 2MB
        MaxUntrackedFiles    = 64
        MaxUntrackedFileBytes = 512KB
        ReviewableExtensions = @('.ps1','.psm1','.ts','.tsx','.js','.jsx','.mjs','.cjs','.sh',
                                 '.py','.sql','.json','.yml','.yaml','.toml','.md','.php','.css','.html')
        SecretishPattern     = '(^|[\/._-])(env|secret|secrets|credential|credentials|token|tokens|password|passwd|vault|id_rsa|id_ed25519)([\/._-]|$)|\.(pem|key|pfx|p12|crt|keystore)$'
        RuntimePathPatterns  = @(
            '^agency-os/reports/oracle/',
            '^\.claude/(sessions|uploads|worktrees)/',
            '(^|/)(node_modules|\.next|dist|build|coverage|tmp|temp|transcripts)/'
        )
    }
}

function Get-OracleSkipReason {
    param(
        [Parameter(Mandatory)][string]$RelativePath,
        [Parameter(Mandatory)][System.Collections.IDictionary]$Policy
    )

    $path = ($RelativePath -replace '\\', '/')
    $runtimePatterns = @($Policy.RuntimePathPatterns)
    if ($runtimePatterns.Count -gt 0 -and $path -match ($runtimePatterns -join '|')) { return 'runtime/generated path' }
    if ($path -match $Policy.SecretishPattern) { return 'name suggests a secret' }
    if ($Policy.ReviewableExtensions -notcontains ([IO.Path]::GetExtension($path).ToLowerInvariant())) {
        return 'not a reviewable source type'
    }
    return $null
}

function Invoke-OracleUntrackedCapture {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string[]]$Candidates,
        [Parameter(Mandatory)][System.Collections.IDictionary]$Policy,
        [string[]]$Path = @()
    )

    $inlined = New-Object System.Collections.Generic.List[string]
    $skipped = New-Object System.Collections.Generic.List[string]
    $additions = New-Object System.Text.StringBuilder

    foreach ($candidate in $Candidates) {
        $relative = ($candidate.Trim() -replace '\\', '/')
        if (-not $relative) { continue }

        if ($Path.Count -gt 0) {
            $inScope = @($Path | Where-Object {
                $scope = (($_ -replace '\\', '/').TrimEnd('/'))
                $relative -eq $scope -or $relative.StartsWith($scope + '/')
            }).Count -gt 0
            if (-not $inScope) { continue }
        }

        $reason = Get-OracleSkipReason -RelativePath $relative -Policy $Policy
        if ($reason) { $skipped.Add("$relative ($reason)"); continue }

        $full = Join-Path $Root ($relative -replace '/', '\\')
        if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
            $skipped.Add("$relative (not a regular file)")
            continue
        }

        $size = (Get-Item -LiteralPath $full).Length
        if ($size -gt $Policy.MaxUntrackedFileBytes) {
            $skipped.Add("$relative (larger than $($Policy.MaxUntrackedFileBytes / 1KB)KB)")
            continue
        }
        if ($inlined.Count -ge $Policy.MaxUntrackedFiles) {
            throw "Oracle capture refused: more than $($Policy.MaxUntrackedFiles) reviewable untracked files. Use -Path to select the intended change."
        }

        $body = Get-Content -LiteralPath $full -Raw -Encoding UTF8
        [void]$additions.Append("`n`n--- NEW UNTRACKED FILE: $relative ---`n")
        [void]$additions.Append($body)
        $inlined.Add($relative)
    }

    return [pscustomobject]@{
        Additions = $additions.ToString()
        Inlined   = @($inlined)
        Skipped   = @($skipped)
    }
}

function Assert-OraclePacketSize {
    param(
        [Parameter(Mandatory)][string]$Packet,
        [Parameter(Mandatory)][System.Collections.IDictionary]$Policy
    )

    $bytes = [Text.Encoding]::UTF8.GetByteCount($Packet)
    if ($bytes -gt $Policy.MaxPacketBytes) {
        throw "Oracle packet refused: $bytes bytes exceeds the $($Policy.MaxPacketBytes) byte safety limit. Narrow the review with -Path or review a smaller commit."
    }
    return $bytes
}
