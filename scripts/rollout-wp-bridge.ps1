<#
.SYNOPSIS
  Upgrade aware-wave-wp-bridge on EVERY WordPress site on the production host that already runs it.

.DESCRIPTION
  wp-bridge is one plugin shared by all managed sites (aware-wave.com, client sites such as soulful). A release
  (scripts/release-wp-bridge.sh) only publishes the zip; this script is the rollout, so no site is left behind.
  Per site, on the host: DB dump -> copy of the current plugin folder -> wp plugin install --force (active stays
  active) -> owner fixed to the plugins folder's owner -> checks (plugin version, REST /health 200 with the new
  version, home page < 500). A failed check puts the previous plugin folder back and the script exits 1.
  Sites are discovered, not listed: every running container with /var/www/html/wp-config.php and the plugin
  folder. Backups: /root/backups/wordpress/<container>-pre-wpbridge-<version>-<UTC>.{sql,tgz}.
  HIGH-RISK (production and client sites): run -DryRun first; client sites then get /client-status and
  /playwright client <slug> (AGENTS.md §7 DoD "Client site").

.PARAMETER Version   Release to roll out (default: AWBRIDGE_VERSION in the plugin file).
.PARAMETER Site      Only these container names (default: all discovered).
.PARAMETER DryRun    Report current versions and what would change; touch nothing.

.EXAMPLE
  .\scripts\rollout-wp-bridge.ps1 -DryRun
  .\scripts\rollout-wp-bridge.ps1
  .\scripts\rollout-wp-bridge.ps1 -Site soulful-wp
#>
param(
    [string]$Version = '',
    [string[]]$Site = @(),
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/prod-host.ps1')

$repoRoot   = Split-Path $PSScriptRoot -Parent
$pluginFile = Join-Path $repoRoot 'lobster-factory/packages/wp-bridge-plugin/aware-wave-wp-bridge.php'
$releaseRepo = 'awarewaveai-pei/aware-wave-wp-bridge'

if (-not $Version) {
    $m = Select-String -Path $pluginFile -Pattern "AWBRIDGE_VERSION', '([0-9]+\.[0-9]+\.[0-9]+)'" | Select-Object -First 1
    if (-not $m) { throw "could not read AWBRIDGE_VERSION from $pluginFile" }
    $Version = $m.Matches[0].Groups[1].Value
}
if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') { throw "bad version: $Version" }
foreach ($s in $Site) { if ($s -notmatch '^[A-Za-z0-9_.-]+$') { throw "bad site name: $s" } }

$work = Join-Path ([IO.Path]::GetTempPath()) ("awb-rollout-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    $zip = Join-Path $work "aware-wave-wp-bridge-v$Version.zip"
    if (-not $DryRun) {
        # The release repo is private: the host cannot download it, so the zip travels with us.
        & gh release download "v$Version" -R $releaseRepo -p "aware-wave-wp-bridge-v$Version.zip" -D $work --clobber
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $zip)) { throw "release v$Version zip not found on $releaseRepo (run scripts/release-wp-bridge.sh first)" }
    }

    $remote = @'
#!/usr/bin/env bash
# Runs on the production host under sudo. Args: <version> <dry:0|1> <zip path or -> [site...]
set -uo pipefail
V="$1"; DRY="$2"; ZIP="$3"; shift 3; ONLY="$*"
PLUG=/var/www/html/wp-content/plugins
BK=/root/backups/wordpress; mkdir -p "$BK"
fail=0; found=""
wpc() { docker exec "$C" wp --allow-root --path=/var/www/html "$@"; }
# A blind discovery must not read as "nothing to do": docker down or no site found = failure.
NAMES=$(docker ps --format '{{.Names}}') || { echo "FAIL docker ps"; exit 1; }
for C in $NAMES; do
  if [ -n "$ONLY" ] && ! printf ' %s ' $ONLY | grep -q " $C "; then continue; fi
  docker exec "$C" test -f /var/www/html/wp-config.php >/dev/null 2>&1 || continue
  docker exec "$C" test -f "$PLUG/aware-wave-wp-bridge/aware-wave-wp-bridge.php" || continue
  found="$found $C"
  docker exec "$C" sh -c 'command -v wp >/dev/null' || { echo "$C: SKIP no wp-cli"; fail=1; continue; }
  CUR=$(wpc plugin get aware-wave-wp-bridge --field=version 2>/dev/null)
  if [ "$CUR" = "$V" ]; then echo "$C: up to date ($V)"; continue; fi
  if [ "$DRY" = "1" ]; then echo "$C: would upgrade $CUR -> $V"; continue; fi
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  # DB container: WORDPRESS_DB_HOST names a container, or a compose service in this site's project.
  DBH=$(docker exec "$C" printenv WORDPRESS_DB_HOST | cut -d: -f1)
  DB=$DBH
  if ! docker inspect "$DB" >/dev/null 2>&1; then
    PROJ=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$C")
    DB=$(docker ps --filter "label=com.docker.compose.project=$PROJ" --filter "label=com.docker.compose.service=$DBH" --format '{{.Names}}' | head -1)
  fi
  SQL="$BK/$C-pre-wpbridge-$V-$TS.sql"
  # MariaDB 11 images publish MARIADB_* and mariadb-dump only (soulful-db); older ones MYSQL_* and mysqldump.
  if [ -z "$DB" ] || ! docker exec "$DB" sh -c 'U=${MARIADB_USER:-${MYSQL_USER:-}}; P=${MARIADB_PASSWORD:-${MYSQL_PASSWORD:-}}; N=${MARIADB_DATABASE:-${MYSQL_DATABASE:-}}; B=$(command -v mariadb-dump || command -v mysqldump); [ -n "$U" ] && [ -n "$N" ] && [ -n "$B" ] && "$B" --single-transaction -u"$U" -p"$P" "$N"' > "$SQL" \
     || ! tail -c 200 "$SQL" | grep -q "Dump completed"; then
    echo "$C: FAIL database backup (db container '${DB:-?}') -- not upgraded"; fail=1; continue
  fi
  TGZ="$BK/$C-wpbridge-$CUR-$TS.tgz"
  docker exec "$C" tar czf /tmp/awb-prev.tgz -C "$PLUG" aware-wave-wp-bridge && docker cp "$C:/tmp/awb-prev.tgz" "$TGZ" \
    || { echo "$C: FAIL plugin folder backup -- not upgraded"; fail=1; continue; }
  OWNER=$(docker exec "$C" stat -c %u:%g "$PLUG")
  ACT=""; wpc plugin is-active aware-wave-wp-bridge && ACT="--activate"
  docker cp "$ZIP" "$C:/tmp/awb.zip"
  wpc plugin install /tmp/awb.zip --force $ACT >/dev/null 2>&1
  docker exec "$C" chown -R "$OWNER" "$PLUG/aware-wave-wp-bridge"
  docker exec "$C" rm -f /tmp/awb.zip
  GOT=$(wpc plugin get aware-wave-wp-bridge --field=version 2>/dev/null)
  HEALTH=$(wpc eval '$r = rest_do_request( new WP_REST_Request( "GET", "/aware-wave-bridge/v1/health" ) ); $d = $r->get_data(); echo $r->get_status(), " ", is_array( $d ) ? ( $d["version"] ?? "" ) : "";' 2>/dev/null)
  HOME_CODE=$(wpc eval 'echo wp_remote_retrieve_response_code( wp_remote_get( home_url( "/" ), array( "timeout" => 20, "redirection" => 3 ) ) );' 2>/dev/null)
  if [ "$GOT" = "$V" ] && { [ -z "$ACT" ] || [ "$HEALTH" = "200 $V" ]; } && [[ "$HOME_CODE" =~ ^[0-9]+$ ]] && [ "$HOME_CODE" -gt 0 ] && [ "$HOME_CODE" -lt 500 ]; then
    echo "$C: OK $CUR -> $V (health '$HEALTH', home $HOME_CODE; backups $SQL $TGZ)"
  else
    echo "$C: FAIL checks (version '$GOT', health '$HEALTH', home '$HOME_CODE') -- restoring $CUR"
    docker exec "$C" rm -rf "$PLUG/aware-wave-wp-bridge"
    docker cp "$TGZ" "$C:/tmp/awb-prev.tgz"
    docker exec "$C" tar xzf /tmp/awb-prev.tgz -C "$PLUG"
    docker exec "$C" chown -R "$OWNER" "$PLUG/aware-wave-wp-bridge"
    echo "$C: restored to $(wpc plugin get aware-wave-wp-bridge --field=version 2>/dev/null)"
    fail=1
  fi
  docker exec "$C" rm -f /tmp/awb-prev.tgz
done
[ "$ZIP" != "-" ] && rm -f "$ZIP"
if [ -z "$found" ]; then echo "FAIL no site running wp-bridge found${ONLY:+ among: $ONLY}"; exit 1; fi
for want in $ONLY; do
  printf ' %s ' $found | grep -q " $want " || { echo "FAIL $want: not a running WordPress site with wp-bridge"; fail=1; }
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
    $cmd = "sudo bash $remoteSh $Version $dry $remoteZip $($Site -join ' '); rc=`$?; rm -f $remoteSh; exit `$rc"
    & ssh @(Get-ProdSshArgs) $cmd
    $rc = $LASTEXITCODE
    Write-Host "[rollout-wp-bridge] v$Version $(if ($DryRun) { 'dry run' } else { 'rollout' }) on $(Get-ProdLabel): exit $rc"
    exit $rc
}
finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
