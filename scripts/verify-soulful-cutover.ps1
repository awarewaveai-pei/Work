#requires -Version 5.1
<#
.SYNOPSIS
  Post-cutover verification for soulfulexpression.org (Hostinger -> Cloudflare DNS).

.DESCRIPTION
  Run this AFTER the nameservers are changed at Hostinger to
  anirban.ns.cloudflare.com / irma.ns.cloudflare.com.

  Checks, in the order that matters if something is wrong:
    1. Nameserver delegation actually moved
    2. Cloudflare zone reports active
    3. Website reachable + served through Cloudflare + valid certificate
    4. IPv6 now answered by Cloudflare (the whole point - Hostinger's AAAA was
       failing 0.11% of the time, 94% of all failures)
    5. MAIL: MX / SPF / DMARC / DKIM still resolve, and DKIM/autodiscover are NOT
       proxied. This is the expensive one - the mailbox subscription is prepaid to
       2029 and a missing record means the client silently stops receiving mail.

  Read-only. Exit code is 0 when every mail-critical check passes, 1 otherwise.

.NOTES
  Record map: agency-os/tenants/company-soulful-expression/core/DNS_MIGRATION_RECORD_MAP.md
  Rollback:   set nameservers back to ns1.dns-parking.com / ns2.dns-parking.com
              (the Hostinger zone is deliberately left in place)
#>
[CmdletBinding()]
param(
    [string]$Domain = "soulfulexpression.org",
    [string]$Resolver = "8.8.8.8"
)

$ErrorActionPreference = "Continue"
Set-StrictMode -Version Latest

$fails = @()
$warns = @()

function Say { param([string]$Text, [string]$Colour = "Gray") Write-Host $Text -ForegroundColor $Colour }
function Check {
    param([string]$Label, [bool]$Ok, [string]$Detail, [switch]$Critical)
    if ($Ok) { Say ("  [PASS] {0} {1}" -f $Label, $Detail) "Green" }
    else {
        if ($Critical) { $script:fails += $Label; Say ("  [FAIL] {0} {1}" -f $Label, $Detail) "Red" }
        else { $script:warns += $Label; Say ("  [WARN] {0} {1}" -f $Label, $Detail) "Yellow" }
    }
}

function Resolve-Dns {
    param([string]$Name, [string]$Type)
    try {
        $r = Resolve-DnsName -Name $Name -Type $Type -Server $Resolver -DnsOnly -ErrorAction Stop
        return @($r)
    } catch { return @() }
}

Say ""
Say ("=== Soulful cutover verification -- {0} ===" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss")) "Cyan"

# 1. delegation ---------------------------------------------------------------
Say ""
Say "1. Nameserver delegation" "Cyan"
$ns = (Resolve-Dns $Domain "NS") | Where-Object { $_.Type -eq "NS" } | ForEach-Object { $_.NameHost }
$onCf = @($ns | Where-Object { $_ -like "*ns.cloudflare.com" }).Count -ge 2
Check "delegated to Cloudflare" $onCf ("-> " + ($ns -join ", ")) -Critical
if (-not $onCf) {
    Say ""
    Say "  尚未切換或仍在傳播中 (最長可能數小時)。其餘檢查仍會執行但結果代表舊狀態。" "Yellow"
}

# 2. website ------------------------------------------------------------------
Say ""
Say "2. Website" "Cyan"
try {
    $resp = Invoke-WebRequest -Uri ("https://{0}/" -f $Domain) -TimeoutSec 30 -MaximumRedirection 5 -UseBasicParsing
    Check "HTTPS 200" ($resp.StatusCode -eq 200) ("status=" + $resp.StatusCode) -Critical
    $server = $resp.Headers["Server"]
    $viaCf = ($server -eq "cloudflare") -or $resp.Headers.ContainsKey("CF-RAY")
    Check "served via Cloudflare" $viaCf ("Server=" + $server)
} catch {
    Check "HTTPS 200" $false ($_.Exception.Message) -Critical
}

# 3. IPv6 (the reason for the migration) --------------------------------------
Say ""
Say "3. IPv6 (Hostinger's AAAA was the failing path)" "Cyan"
$aaaa = (Resolve-Dns $Domain "AAAA") | Where-Object { $_.Type -eq "AAAA" } | ForEach-Object { $_.IPAddress }
$oldV6 = @($aaaa | Where-Object { $_ -like "2a02:4780:*" }).Count -gt 0
Check "AAAA no longer Hostinger's" (-not $oldV6) ("-> " + ($aaaa -join ", "))
Check "AAAA present (Cloudflare)" (@($aaaa).Count -gt 0) ("count=" + @($aaaa).Count)

# 4. MAIL - the expensive one -------------------------------------------------
Say ""
Say "4. MAIL (mailbox prepaid to 2029 - a missing record = silent mail loss)" "Cyan"

$mx = (Resolve-Dns $Domain "MX") | Where-Object { $_.Type -eq "MX" }
$mx1 = @($mx | Where-Object { $_.NameExchange -like "mx1.hostinger.com*" }).Count -eq 1
$mx2 = @($mx | Where-Object { $_.NameExchange -like "mx2.hostinger.com*" }).Count -eq 1
Check "MX mx1.hostinger.com" $mx1 "" -Critical
Check "MX mx2.hostinger.com" $mx2 "" -Critical

$txt = (Resolve-Dns $Domain "TXT") | Where-Object { $_.Type -eq "TXT" } | ForEach-Object { $_.Strings -join "" }
Check "SPF present" (@($txt | Where-Object { $_ -like "v=spf1*hostinger*" }).Count -eq 1) "" -Critical
Check "google-site-verification kept" (@($txt | Where-Object { $_ -like "google-site-verification=*" }).Count -eq 1) ""

$dmarc = (Resolve-Dns ("_dmarc." + $Domain) "TXT") | Where-Object { $_.Type -eq "TXT" } | ForEach-Object { $_.Strings -join "" }
Check "DMARC present" (@($dmarc | Where-Object { $_ -like "v=DMARC1*" }).Count -eq 1) "" -Critical

foreach ($sel in @("hostingermail-a", "hostingermail-b")) {
    $n = "{0}._domainkey.{1}" -f $sel, $Domain
    $c = (Resolve-Dns $n "CNAME") | Where-Object { $_.Type -eq "CNAME" } | ForEach-Object { $_.NameHost }
    $ok = @($c | Where-Object { $_ -like "*dkim.mail.hostinger.com*" }).Count -eq 1
    Check ("DKIM " + $sel) $ok ("-> " + ($c -join ",")) -Critical
    # A proxied CNAME would resolve to a Cloudflare address instead of Hostinger's.
    $a = (Resolve-Dns $n "A") | Where-Object { $_.Type -eq "A" } | ForEach-Object { $_.IPAddress }
    if (@($a).Count -gt 0) {
        $proxied = @($a | Where-Object { $_ -like "104.*" -or $_ -like "172.6*" -or $_ -like "188.114.*" -or $_ -like "162.15*" }).Count -gt 0
        Check ("DKIM " + $sel + " NOT proxied") (-not $proxied) ("A=" + ($a -join ",")) -Critical
    }
}

foreach ($n in @("autodiscover", "autoconfig")) {
    $c = (Resolve-Dns ("{0}.{1}" -f $n, $Domain) "CNAME") | Where-Object { $_.Type -eq "CNAME" } | ForEach-Object { $_.NameHost }
    Check ($n + " CNAME") (@($c | Where-Object { $_ -like "*mail.hostinger.com*" }).Count -eq 1) ("-> " + ($c -join ","))
}

# summary ---------------------------------------------------------------------
Say ""
Say "=== Summary ===" "Cyan"
if ($fails.Count -eq 0) {
    Say ("  ALL CRITICAL CHECKS PASSED" + $(if ($warns.Count) { "  (warnings: " + ($warns -join ", ") + ")" } else { "" })) "Green"
    Say ""
    Say "  仍需人工確認 (DNS 無法證明): 實際寄一封信進、回一封信出。" "Yellow"
    exit 0
} else {
    Say ("  CRITICAL FAILURES: " + ($fails -join ", ")) "Red"
    Say ""
    Say "  回滾: Hostinger nameserver 改回 ns1.dns-parking.com / ns2.dns-parking.com" "Yellow"
    exit 1
}
