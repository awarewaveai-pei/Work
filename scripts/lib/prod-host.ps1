# The one place PowerShell operator scripts learn how to reach the production host (AGENTS.md §0: ks-aw-01).
# Dot-source, then pass Get-ProdSshArgs / Get-ProdScpArgs to ssh / scp. A script's -SshTarget override (an
# explicit ssh alias or user@host) still wins, for recovery hosts.
# Why a file and not ~/.ssh/config aliases: machine-local aliases outlived the hosts they named and kept
# pointing scripts at released addresses (WORKLOG 2026-09-24). Moving hosts = edit this file only.

$script:ProdHost = [ordered]@{
    Name = 'ks-aw-01'
    Host = '145.239.195.47'
    Port = 58122
    User = 'ubuntu'   # remote commands that need root run under sudo
    Key  = (Join-Path $env:USERPROFILE '.ssh\id_ed25519')
}

function Get-ProdSshArgs {
    param([string]$Override = '')
    if ($Override) { return @($Override) }
    $h = $script:ProdHost
    return @('-p', $h.Port, '-i', $h.Key, '-o', 'IdentitiesOnly=yes', "$($h.User)@$($h.Host)")
}

# scp: options go before the file list, $dest prefixes the remote path ("<dest>:/tmp/x").
function Get-ProdScpArgs {
    param([string]$Override = '')
    if ($Override) { return [pscustomobject]@{ Options = @(); Dest = $Override } }
    $h = $script:ProdHost
    return [pscustomobject]@{ Options = @('-P', $h.Port, '-i', $h.Key, '-o', 'IdentitiesOnly=yes'); Dest = "$($h.User)@$($h.Host)" }
}

function Get-ProdLabel {
    param([string]$Override = '')
    if ($Override) { return $Override }
    return "$($script:ProdHost.Name) ($($script:ProdHost.User)@$($script:ProdHost.Host):$($script:ProdHost.Port))"
}
