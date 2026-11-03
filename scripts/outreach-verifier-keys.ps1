<#
.SYNOPSIS
  Install the outreach mailbox-verifier keys (SPEC D25) from the user environment into production.

.DESCRIPTION
  Reads REOON_API_KEY / ZEROBOUNCE_API_KEY / HUNTER_API_KEY (set by mcp/user-env.ps1). For each one that is set, makes
  sure an agency connector exists (co_connector_accounts, organization_id NULL, every organization falls back to it),
  vaults the key under connectorSecretRef(id) = 'co_connector:<id>' (secret_put, migration 0049) and enables it -- the
  same end state as the Connectors page secret route. The key travels only on ssh stdin, never in argv or output.
  Prints one line per provider: installed / skipped (not set).
#>
param([switch]$WhatIf)
$ErrorActionPreference = "Stop"

$keys = [ordered]@{ reoon = "REOON_API_KEY"; zerobounce = "ZEROBOUNCE_API_KEY"; hunter = "HUNTER_API_KEY" }
$sql = @("\set ON_ERROR_STOP on")
$installed = @()
foreach ($provider in $keys.Keys) {
  $name = $keys[$provider]
  $value = [Environment]::GetEnvironmentVariable($name, "Process")
  if (-not $value) { $value = [Environment]::GetEnvironmentVariable($name, "User") }
  if (-not $value -or $value -eq "xxx") { Write-Output "$provider : skipped ($name not set)"; continue }
  # Keys are opaque tokens; anything else would break the dollar-quoted literal below.
  if ($value -notmatch '^[A-Za-z0-9_\-\.]{8,200}$') { throw "$name has unexpected characters; not sent" }
  $sql += @"
begin;
insert into public.co_connector_accounts (organization_id, connector_name, connector_type, is_enabled)
  select null, '$provider', 'email_verification', true
  where not exists (select 1 from public.co_connector_accounts where organization_id is null and connector_name = '$provider');
select public.secret_put('co_connector:' || id, `$k`$$value`$k`$) from public.co_connector_accounts where organization_id is null and connector_name = '$provider';
update public.co_connector_accounts set credentials_ref = 'co_connector:' || id, is_enabled = true, updated_at = now()
  where organization_id is null and connector_name = '$provider';
commit;
"@
  $installed += $provider
}
if (-not $installed.Count) { Write-Output "nothing to install"; exit 0 }
if ($WhatIf) { Write-Output "would install: $($installed -join ', ')"; exit 0 }

$out = ($sql -join "`n") | ssh -p 58122 -o BatchMode=yes ubuntu@145.239.195.47 "sudo docker exec -i supabase-db psql -U postgres -At -q" 2>&1
if ($LASTEXITCODE -ne 0) { throw "psql failed (exit $LASTEXITCODE): $(($out | Out-String) -replace '[A-Za-z0-9_\-\.]{24,}', '***')" }
foreach ($p in $installed) { Write-Output "$p : installed (agency connector, vaulted, enabled)" }
