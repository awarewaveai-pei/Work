# One writer for the repo's LF text files (WORKLOG, TASKS, memory notes, auto-synced docs). .gitattributes
# `* text=auto eol=lf` makes the working tree LF; [Environment]::NewLine and "`r`n" joins are CRLF, so a block
# written into an LF file left it mixed (2026-10-03: WORKLOG 15186 CRLF lines), which breaks byte/regex
# anchors in tools that read the worktree (2026-09-25). Callers may join with any newline; the file is
# written LF. An existing file keeps its BOM state (memory notes carry one, TASKS/WORKLOG do not -- writers
# that always added or always stripped it made the first line flip between runs); a new file has no BOM.
function Write-RepoTextFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
        [switch]$Atomic   # write <Path>.tmp then rename over Path
    )
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $bom = $false
    if (Test-Path -LiteralPath $Path) {
        $fs = [System.IO.File]::OpenRead($Path)
        try {
            $head = New-Object byte[] 3
            $n = $fs.Read($head, 0, 3)
            $bom = ($n -eq 3 -and $head[0] -eq 0xEF -and $head[1] -eq 0xBB -and $head[2] -eq 0xBF)
        } finally {
            $fs.Dispose()
        }
    }
    $text = $Content -replace "`r`n", "`n"
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }   # BOM decided above
    $enc = New-Object System.Text.UTF8Encoding $bom
    if ($Atomic) {
        $tmp = "$Path.tmp"
        [System.IO.File]::WriteAllText($tmp, $text, $enc)
        Move-Item -LiteralPath $tmp -Destination $Path -Force
    } else {
        [System.IO.File]::WriteAllText($Path, $text, $enc)
    }
}
