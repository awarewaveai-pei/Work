<#
.SYNOPSIS
  Upgrade one of our WordPress plugins on EVERY site on the production host that already runs it.

.DESCRIPTION
  -Plugin bridge (default): aware-wave-wp-bridge, shared by all managed sites (aware-wave.com, client sites such as
  soulful). -Plugin store: aware-wave-store, registered seller sites only (aware-wave.com is the first). A release (scripts/release-wp-bridge.sh) only
  publishes the zip; this script is the rollout, so no site is left behind.
  Per site, on the host: DB dump -> copy of the current plugin folder -> wp plugin install --force (active stays
  active) -> owner fixed to the plugins folder's owner -> checks (plugin version; bridge: REST /health 200 with the
  new version; store: plugin active; home page < 500). A failed check puts the previous plugin folder back (a fresh
  -Install is removed again) and the script exits 1.
  Sites are discovered, not listed: every running container with /var/www/html/wp-config.php and the plugin
  folder, so an upgrade never installs a plugin where it was not. -Install is the one exception and needs -Site:
  the store plugin is installed only on a site named on purpose and registered as an active seller site.
  Backups: /root/backups/wordpress/<container>-pre-<wpbridge|awstore>-<version>-<UTC>.{sql,tgz}.
  HIGH-RISK (production and client sites): run -DryRun first; client sites then get /client-status and
  /playwright client <slug> (AGENTS.md §7 DoD "Client site").

.PARAMETER Plugin    bridge (default) or store.
.PARAMETER Version   Release to roll out (default: the version define in the plugin file).
.PARAMETER Site      Only these container names (default: all discovered).
.PARAMETER Install   Install where the plugin is missing; only together with -Site.
.PARAMETER DryRun    Report current versions and what would change; touch nothing.

.EXAMPLE
  .\scripts\rollout-wp-bridge.ps1 -DryRun
  .\scripts\rollout-wp-bridge.ps1
  .\scripts\rollout-wp-bridge.ps1 -Site soulful-wp
  .\scripts\rollout-wp-bridge.ps1 -Plugin store -Install -Site lobster-wordpress
#>
param(
    [ValidateSet('bridge', 'store')][string]$Plugin = 'bridge',
    [string]$Version = '',
    [string[]]$Site = @(),
    [switch]$Install,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/prod-host.ps1')

$spec = @{
    bridge = @{ Slug = 'aware-wave-wp-bridge'; Pkg = 'wp-bridge-plugin';        Const = 'AWBRIDGE_VERSION'; Short = 'wpbridge' }
    store  = @{ Slug = 'aware-wave-store';     Pkg = 'aware-wave-store-plugin'; Const = 'AWSTORE_VERSION';  Short = 'awstore' }
}[$Plugin]
$slug        = $spec.Slug
$repoRoot    = Split-Path $PSScriptRoot -Parent
$pluginFile  = Join-Path $repoRoot "lobster-factory/packages/$($spec.Pkg)/$slug.php"
$releaseRepo = "awarewaveai-pei/$slug"

if (-not $Version) {
    $m = Select-String -Path $pluginFile -Pattern "$($spec.Const)', '([0-9]+\.[0-9]+\.[0-9]+)'" | Select-Object -First 1
    if (-not $m) { throw "could not read $($spec.Const) from $pluginFile" }
    $Version = $m.Matches[0].Groups[1].Value
}
if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') { throw "bad version: $Version" }
foreach ($s in $Site) { if ($s -notmatch '^[A-Za-z0-9_.-]+$') { throw "bad site name: $s" } }
if ($Install -and $Site.Count -eq 0) { throw '-Install needs -Site: a plugin is installed only on a site named on purpose' }

$work = Join-Path ([IO.Path]::GetTempPath()) ("awb-rollout-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    $zip = Join-Path $work "$slug-v$Version.zip"
    if (-not $DryRun) {
        # The host has no gh login; the zip travels with us from this machine.
        & gh release download "v$Version" -R $releaseRepo -p "$slug-v$Version.zip" -D $work --clobber
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $zip)) { throw "release v$Version zip not found on $releaseRepo (run scripts/release-wp-bridge.sh --plugin $Plugin first)" }
    }

    $remote = @'
#!/usr/bin/env bash
# Runs on the production host under sudo. Args: <slug> <short> <version> <dry:0|1> <install:0|1> <zip or -> [site...]
set -uo pipefail
SLUG="$1"; SHORT="$2"; V="$3"; DRY="$4"; INSTALL="$5"; ZIP="$6"; shift 6; ONLY="$*"
PLUG=/var/www/html/wp-content/plugins
BK=/root/backups/wordpress; mkdir -p "$BK"
fail=0; found=""
wpc() { docker exec "$C" wp --allow-root --path=/var/www/html "$@"; }
# A blind discovery must not read as "nothing to do": docker down or no site found = failure.
NAMES=$(docker ps --format '{{.Names}}') || { echo "FAIL docker ps"; exit 1; }
for C in $NAMES; do
  if [ -n "$ONLY" ] && ! printf ' %s ' $ONLY | grep -q " $C "; then continue; fi
  docker exec "$C" test -f /var/www/html/wp-config.php >/dev/null 2>&1 || continue
  # -Install (only with named sites, checked locally) is the one way onto a site that does not have the plugin yet.
  HAD=0; docker exec "$C" test -f "$PLUG/$SLUG/$SLUG.php" && HAD=1
  [ "$HAD" = "1" ] || [ "$INSTALL" = "1" ] || continue
  found="$found $C"
  docker exec "$C" sh -c 'command -v wp >/dev/null' || { echo "$C: SKIP no wp-cli"; fail=1; continue; }
  CUR=$(wpc plugin get "$SLUG" --field=version 2>/dev/null)
  # An installed plugin whose version WP-CLI cannot read (DB hiccup, another plugin's fatal) is not "absent":
  # treating it as a fresh install would skip the folder backup and delete the folder on a failed check.
  if [ "$HAD" = "1" ] && [ -z "$CUR" ]; then echo "$C: FAIL cannot read the installed $SLUG version -- not touched"; fail=1; continue; fi
  # The store plugin belongs only on a site registered as a seller site (ADR 017 4c-3): next-admin's
  # GET /api/internal/sellers/sites?host=<host> answers {"host":..,"active":true|false}; only active=true installs.
  # Asked from inside the next-admin container with its own SCHEDULE_INGEST_TOKEN (the token never leaves the host).
  # Any other answer (route not deployed yet, 401, timeout) is a refusal: fail closed.
  if [ "$SLUG" = "aware-wave-store" ]; then
    SHOST=$(wpc option get home 2>/dev/null | sed -E 's#^[a-z]+://##; s#[/:].*$##' | tr 'A-Z' 'a-z')
    SACTIVE=$(docker exec -e SHOST="$SHOST" lobster-next-admin node -e "const t=process.env.SCHEDULE_INGEST_TOKEN||'';if(!t||!process.env.SHOST){console.log('no');process.exit(0);}fetch('http://127.0.0.1:3000/api/internal/sellers/sites?host='+encodeURIComponent(process.env.SHOST),{headers:{authorization:'Bearer '+t},signal:AbortSignal.timeout(20000)}).then(async r=>{const j=r.ok?await r.json():{};console.log(j&&j.active===true&&j.host===process.env.SHOST?'yes':'no');}).catch(()=>console.log('no'));" 2>/dev/null | tail -1)
    if [ -z "$SHOST" ] || [ "$SACTIVE" != "yes" ]; then
      echo "$C: FAIL '${SHOST:-?}' is not an active seller site (seller_sites) -- aware-wave-store refused"; fail=1; continue
    fi
  fi
  # wp-bridge >= 0.19.0 no longer carries AwareWave billing: a site opted in to billing must have aware-wave-store
  # first, or payments in between are never sent and unverified members can check out.
  if [ "$SLUG" = "aware-wave-wp-bridge" ] && [ "$(printf '%s\n' 0.19.0 "$V" | sort -V | head -1)" = "0.19.0" ] \
     && wpc option get aware_wave_payments_enabled >/dev/null 2>&1 \
     && ! wpc plugin is-active aware-wave-store >/dev/null 2>&1; then
    # Active, not merely present: an inactive store registers nothing either (Codex 2026-10-25 F2).
    echo "$C: FAIL billing is enabled here but aware-wave-store is not installed and active -- install/activate it first (-Plugin store -Install -Site $C); not upgraded"
    fail=1; continue
  fi
  if [ "$CUR" = "$V" ]; then echo "$C: up to date ($V)"; continue; fi
  if [ "$DRY" = "1" ]; then echo "$C: would $( [ -n "$CUR" ] && echo "upgrade $CUR" || echo install ) -> $V"; continue; fi
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  # DB container: WORDPRESS_DB_HOST names a container, or a compose service in this site's project.
  DBH=$(docker exec "$C" printenv WORDPRESS_DB_HOST | cut -d: -f1)
  DB=$DBH
  if ! docker inspect "$DB" >/dev/null 2>&1; then
    PROJ=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$C")
    DB=$(docker ps --filter "label=com.docker.compose.project=$PROJ" --filter "label=com.docker.compose.service=$DBH" --format '{{.Names}}' | head -1)
  fi
  SQL="$BK/$C-pre-$SHORT-$V-$TS.sql"
  # MariaDB 11 images publish MARIADB_* and mariadb-dump only (soulful-db); older ones MYSQL_* and mysqldump.
  if [ -z "$DB" ] || ! docker exec "$DB" sh -c 'U=${MARIADB_USER:-${MYSQL_USER:-}}; P=${MARIADB_PASSWORD:-${MYSQL_PASSWORD:-}}; N=${MARIADB_DATABASE:-${MYSQL_DATABASE:-}}; B=$(command -v mariadb-dump || command -v mysqldump); [ -n "$U" ] && [ -n "$N" ] && [ -n "$B" ] && "$B" --single-transaction -u"$U" -p"$P" "$N"' > "$SQL" \
     || ! tail -c 200 "$SQL" | grep -q "Dump completed"; then
    echo "$C: FAIL database backup (db container '${DB:-?}') -- not upgraded"; fail=1; continue
  fi
  TGZ=""
  if [ "$HAD" = "1" ]; then
    TGZ="$BK/$C-$SHORT-$CUR-$TS.tgz"
    docker exec "$C" tar czf /tmp/awb-prev.tgz -C "$PLUG" "$SLUG" && docker cp "$C:/tmp/awb-prev.tgz" "$TGZ" \
      || { echo "$C: FAIL plugin folder backup -- not upgraded"; fail=1; continue; }
  fi
  OWNER=$(docker exec "$C" stat -c %u:%g "$PLUG")
  ACT=""; { [ "$HAD" = "0" ] || wpc plugin is-active "$SLUG"; } && ACT="--activate"
  docker cp "$ZIP" "$C:/tmp/awb.zip"
  wpc plugin install /tmp/awb.zip --force $ACT >/dev/null 2>&1
  docker exec "$C" chown -R "$OWNER" "$PLUG/$SLUG"
  docker exec "$C" rm -f /tmp/awb.zip
  GOT=$(wpc plugin get "$SLUG" --field=version 2>/dev/null)
  if [ "$SLUG" = "aware-wave-wp-bridge" ]; then
    HEALTH=$(wpc eval '$r = rest_do_request( new WP_REST_Request( "GET", "/aware-wave-bridge/v1/health" ) ); $d = $r->get_data(); echo $r->get_status(), " ", is_array( $d ) ? ( $d["version"] ?? "" ) : "";' 2>/dev/null)
  else
    # No REST route of its own: active with the new version is its health.
    HEALTH=$(wpc plugin is-active "$SLUG" && echo "200 $V")
  fi
  HOME_CODE=$(wpc eval 'echo wp_remote_retrieve_response_code( wp_remote_get( home_url( "/" ), array( "timeout" => 20, "redirection" => 3 ) ) );' 2>/dev/null)
  if [ "$GOT" = "$V" ] && { [ -z "$ACT" ] || [ "$HEALTH" = "200 $V" ]; } && [[ "$HOME_CODE" =~ ^[0-9]+$ ]] && [ "$HOME_CODE" -gt 0 ] && [ "$HOME_CODE" -lt 500 ]; then
    echo "$C: OK ${CUR:-none} -> $V (health '$HEALTH', home $HOME_CODE; backups $SQL ${TGZ:-no previous folder})"
  else
    echo "$C: FAIL checks (version '$GOT', health '$HEALTH', home '$HOME_CODE') -- restoring ${CUR:-none}"
    if [ "$HAD" = "1" ]; then
      docker exec "$C" rm -rf "$PLUG/$SLUG"
      docker cp "$TGZ" "$C:/tmp/awb-prev.tgz"
      docker exec "$C" tar xzf /tmp/awb-prev.tgz -C "$PLUG"
      docker exec "$C" chown -R "$OWNER" "$PLUG/$SLUG"
      echo "$C: restored to $(wpc plugin get "$SLUG" --field=version 2>/dev/null)"
    else
      wpc plugin deactivate "$SLUG" >/dev/null 2>&1
      docker exec "$C" rm -rf "$PLUG/$SLUG"
      echo "$C: fresh install removed"
    fi
    fail=1
  fi
  docker exec "$C" rm -f /tmp/awb-prev.tgz
done
[ "$ZIP" != "-" ] && rm -f "$ZIP"
if [ -z "$found" ]; then echo "FAIL no site running $SLUG found${ONLY:+ among: $ONLY}"; exit 1; fi
for want in $ONLY; do
  printf ' %s ' $found | grep -q " $want " || { echo "FAIL $want: not a running WordPress site with $SLUG"; fail=1; }
done
exit $fail
'@
    $remoteFile = Join-Path $work 'rollout-remote.sh'
    [IO.File]::WriteAllText($remoteFile, ($remote -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding($false)))

    $tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $remoteSh  = "/tmp/awb-rollout-$tag.sh"
    $remoteZip = if ($DryRun) { '-' } else { "/tmp/awb-rollout-$tag.zip" }
    $scp = Get-ProdScpArgs
    & scp @($scp.Options) $remoteFile "$($scp.Dest):$remoteSh"
    if ($LASTEXITCODE -ne 0) { throw 'scp of the remote script failed' }
    if (-not $DryRun) {
        & scp @($scp.Options) $zip "$($scp.Dest):$remoteZip"
        if ($LASTEXITCODE -ne 0) { throw 'scp of the zip failed' }
    }
    $dry = if ($DryRun) { '1' } else { '0' }
    $inst = if ($Install) { '1' } else { '0' }
    $cmd = "sudo bash $remoteSh $slug $($spec.Short) $Version $dry $inst $remoteZip $($Site -join ' '); rc=`$?; rm -f $remoteSh; exit `$rc"
    & ssh @(Get-ProdSshArgs) $cmd
    $rc = $LASTEXITCODE
    Write-Host "[rollout-wp-bridge] $slug v$Version $(if ($DryRun) { 'dry run' } else { 'rollout' }) on $(Get-ProdLabel): exit $rc"
    exit $rc
}
finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
