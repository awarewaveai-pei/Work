param(
    [string]$Src = 'C:\Users\USER\Work\mcp\claude-userlevel\settings.template.json',
    [string]$Tgt = 'C:\Users\USER\.claude\settings.json',
    [string]$MonorepoRoot = 'C:\Users\USER\Work',
    [string]$UserProfile  = 'C:\Users\USER'
)

function Expand-Vars([string]$Value) {
    if ($null -eq $Value) { return $Value }
    $uf = $UserProfile -replace '\\','\\'; $rf = $MonorepoRoot -replace '\\','\\'
    $Value = $Value.Replace('${USERPROFILE_FORWARD}', ($UserProfile -replace '\\','/'))
    $Value = $Value.Replace('${USERPROFILE}', $UserProfile)
    $Value = $Value.Replace('${MONOREPO_ROOT_FORWARD}', ($MonorepoRoot -replace '\\','/'))
    $Value = $Value.Replace('${MONOREPO_ROOT}', $MonorepoRoot)
    return $Value
}
function Expand-VarsR($obj) {
    if ($null -eq $obj) { return $null }
    if ($obj -is [string]) { return Expand-Vars $obj }
    if ($obj -is [System.Collections.IEnumerable] -and -not ($obj -is [string])) {
        return @($obj | ForEach-Object { Expand-VarsR $_ })
    }
    if ($obj -is [PSCustomObject]) {
        $copy = [ordered]@{}
        foreach ($p in $obj.PSObject.Properties) { $copy[$p.Name] = Expand-VarsR $p.Value }
        return [PSCustomObject]$copy
    }
    return $obj
}
function GNK($obj, [string]$path) {
    $cur = $obj
    foreach ($p in ($path -split '\.')) { if ($null -eq $cur) { return $null }; try { $cur = $cur.$p } catch { return $null } }
    return $cur
}
function SNK($obj, [string]$path, $value) {
    $parts = $path -split '\.'
    $cur = $obj
    for ($i = 0; $i -lt $parts.Count-1; $i++) {
        $nx = $cur.($parts[$i])
        if ($null -eq $nx) { $nx = [PSCustomObject]@{}; $cur | Add-Member -MemberType NoteProperty -Name $parts[$i] -Value $nx -Force }
        $cur = $nx
    }
    $cur | Add-Member -MemberType NoteProperty -Name $parts[-1] -Value $value -Force
}

$tplRaw = Get-Content $Src -Raw -Encoding UTF8 | ConvertFrom-Json
$tplRaw.PSObject.Properties.Remove('_comment') 2>$null
$tpl = Expand-VarsR $tplRaw
$existing = Get-Content $Tgt -Raw -Encoding UTF8 | ConvertFrom-Json

$existingJsonBefore = $existing | ConvertTo-Json -Depth 30 -Compress
$merged = $existing | ConvertTo-Json -Depth 30 | ConvertFrom-Json

$overwriteKeys = @('autoUpdatesChannel','theme','permissions.defaultMode','permissions.skipDangerousModePermissionPrompt','permissions.deny','permissions.additionalDirectories','hooks')
foreach ($k in $overwriteKeys) { SNK $merged $k (GNK $tpl $k) }

$mergedJsonAfter = $merged | ConvertTo-Json -Depth 30 -Compress
Write-Host "hasDrift: $($existingJsonBefore -ne $mergedJsonAfter)"
Write-Host "Lengths: existing=$($existingJsonBefore.Length) merged=$($mergedJsonAfter.Length)"

if ($existingJsonBefore -ne $mergedJsonAfter) {
    $len = [Math]::Min($existingJsonBefore.Length, $mergedJsonAfter.Length)
    for ($i = 0; $i -lt $len; $i++) {
        if ($existingJsonBefore[$i] -ne $mergedJsonAfter[$i]) {
            $start = [Math]::Max(0, $i-40)
            Write-Host "First diff at char $i"
            Write-Host "EXISTING[$i]: $($existingJsonBefore.Substring($start, [Math]::Min(100, $existingJsonBefore.Length-$start)))"
            Write-Host "MERGED  [$i]: $($mergedJsonAfter.Substring($start, [Math]::Min(100, $mergedJsonAfter.Length-$start)))"
            break
        }
    }
}
