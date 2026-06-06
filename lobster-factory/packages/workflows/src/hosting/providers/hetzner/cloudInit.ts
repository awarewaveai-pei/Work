/**
 * Day-1 hardening cloud-init (#cloud-config) for a fresh Hetzner host.
 *
 * Built as a TS string (not a read-at-runtime .tmpl file) so it survives bundled /
 * serverless execution — the same lesson as `resolveLobsterRepoRoot` (file reads in
 * bundled runs are fragile).
 *
 * Encodes the "bare-metal self-protection" subset of HETZNER_PROVISIONING_HARDENING_SOP
 * that MUST be live before the first inbound packet — the rest (vault secrets, certbot,
 * crons) runs in the post-boot SSH phase.
 *
 * HARD RULES (official-source audited — see PLAN appendix A):
 *  - user_data is metadata-readable by ANY process with no auth → NEVER put a secret here.
 *  - user_data must stay <= 32 KiB (Hetzner limit). `renderDay1CloudInit` asserts this.
 *  - SSH: key-only, no passwords (item 5), no root password login.
 *  - Firewall MUST cover BOTH IPv4 and IPv6 — Hetzner gives every server a public /64,
 *    and ip6tables defaults to ACCEPT, so an IPv4-only INPUT DROP leaves the host wide
 *    open on v6 (and Docker would bind containers on ::). DOCKER-USER guards (items 3,4)
 *    are re-applied by a systemd unit ordered After=docker.service so they survive the
 *    auto-reboot this file also enables.
 */

export const CLOUD_INIT_MAX_BYTES = 32_768;

export type Day1CloudInitParams = {
  /** Per-tenant SSH PUBLIC key (never the private key). */
  sshPublicKey: string;
  /** Hostname for the new server, e.g. "lf-stg-sin-acme-shop". */
  hostname: string;
  /** Deploy username (non-root). */
  deployUser?: string;
  /** Auto-reboot time, UTC "HH:MM" (stagger per host to avoid simultaneous reboots). */
  autoRebootTime?: string;
};

function assertNoSecretLeak(sshPublicKey: string): void {
  const key = sshPublicKey.trim();
  if (/PRIVATE KEY/i.test(key)) {
    throw new Error("cloud-init refuses a PRIVATE KEY in sshPublicKey — public key only");
  }
  // Defence in depth: only accept a recognised SSH public-key prefix, so a pasted token
  // or PEM cert body cannot slip into metadata-readable user_data.
  if (!/^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-|sk-(ssh|ecdsa))/.test(key)) {
    throw new Error("cloud-init sshPublicKey does not look like an OpenSSH public key");
  }
}

function indent(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return block.split("\n").map((l) => (l.length ? pad + l : l)).join("\n");
}

// IPv4 INPUT default DROP — only lo / established / icmp / 22,80,443.
const IPTABLES_RULES_V4 = `*filter
:INPUT DROP [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]
-A INPUT -i lo -j ACCEPT
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p icmp --icmp-type echo-request -j ACCEPT
-A INPUT -p tcp --dport 22 -j ACCEPT
-A INPUT -p tcp --dport 80 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT
COMMIT
`;

// IPv6 mirror — without this the host is fully reachable on its public /64 (icmpv6 kept
// for Path MTU Discovery / NDP, which IPv6 needs to function).
const IPTABLES_RULES_V6 = `*filter
:INPUT DROP [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]
-A INPUT -i lo -j ACCEPT
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p ipv6-icmp -j ACCEPT
-A INPUT -p tcp --dport 22 -j ACCEPT
-A INPUT -p tcp --dport 80 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT
COMMIT
`;

// Applied (v4 AND v6) by a systemd unit ordered After=docker.service so the guard is
// re-installed every time Docker (re)creates its chains — surviving reboots. DOCKER-USER
// runs BEFORE Docker's auto chain: the only way to stop a 0.0.0.0/:: container bind from
// bypassing the host firewall (the crypto-miner root cause).
const DOCKER_FIREWALL_SCRIPT = `#!/usr/bin/env bash
# Idempotent DOCKER-USER guard for IPv4 + IPv6. Re-runnable; flushes then re-adds.
set -u
for ipt in iptables ip6tables; do
  $ipt -N DOCKER-USER 2>/dev/null || true
  $ipt -F DOCKER-USER 2>/dev/null || true
  $ipt -A DOCKER-USER -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
  $ipt -A DOCKER-USER -i eth0 -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
  $ipt -A DOCKER-USER -i eth0 -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
  $ipt -A DOCKER-USER -i eth0 -j DROP 2>/dev/null || true
done
`;

const DOCKER_FIREWALL_UNIT = `[Unit]
Description=AwareWave DOCKER-USER firewall guard (v4+v6)
After=docker.service network-online.target
Wants=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/awarewave-docker-firewall.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
`;

// sshd_config.d drop-in (highest-numbered → wins over cloud-image drop-ins like
// 50-cloud-init.conf). More reliable than in-place sed on a minimal/overridden config.
const SSHD_HARDENING = `# AwareWave day-1 SSH hardening (item 5)
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
`;

export function renderDay1CloudInit(params: Day1CloudInitParams): {
  userData: string;
  bytes: number;
} {
  assertNoSecretLeak(params.sshPublicKey);
  const deployUser = params.deployUser ?? "deploy";
  const rebootTime = params.autoRebootTime ?? "20:00";
  const pubkey = params.sshPublicKey.trim();

  // Least privilege: ONLY the non-root deploy user gets the key + NOPASSWD sudo.
  // root login is disabled (PermitRootLogin no) — no root key block.
  const userData = `#cloud-config
hostname: ${params.hostname}
ssh_pwauth: false
disable_root: true
users:
  - name: ${deployUser}
    groups: [sudo]
    sudo: ["ALL=(ALL) NOPASSWD:ALL"]
    shell: /bin/bash
    lock_passwd: true
    ssh_authorized_keys:
      - ${pubkey}

package_update: true
packages:
  - iptables-persistent
  - fail2ban
  - unattended-upgrades
  - curl
  - jq

write_files:
  - path: /etc/iptables/rules.v4
    permissions: "0644"
    content: |
${indent(IPTABLES_RULES_V4, 6)}
  - path: /etc/iptables/rules.v6
    permissions: "0644"
    content: |
${indent(IPTABLES_RULES_V6, 6)}
  - path: /usr/local/bin/awarewave-docker-firewall.sh
    permissions: "0755"
    content: |
${indent(DOCKER_FIREWALL_SCRIPT, 6)}
  - path: /etc/systemd/system/awarewave-docker-firewall.service
    permissions: "0644"
    content: |
${indent(DOCKER_FIREWALL_UNIT, 6)}
  - path: /etc/ssh/sshd_config.d/99-awarewave-hardening.conf
    permissions: "0644"
    content: |
${indent(SSHD_HARDENING, 6)}
  - path: /etc/apt/apt.conf.d/52awarewave-auto-reboot
    permissions: "0644"
    content: |
      Unattended-Upgrade::Automatic-Reboot "true";
      Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
      Unattended-Upgrade::Automatic-Reboot-Time "${rebootTime}";
  - path: /etc/sysctl.d/60-awarewave-hardening.conf
    permissions: "0644"
    content: |
      net.ipv4.conf.all.rp_filter=1
      net.ipv4.tcp_syncookies=1
      kernel.kptr_restrict=2

runcmd:
  - systemctl reload ssh || systemctl reload sshd || true
  # Apply firewall for BOTH stacks (items 3,4) — IPv4 then IPv6.
  - iptables-restore < /etc/iptables/rules.v4
  - ip6tables-restore < /etc/iptables/rules.v6
  - netfilter-persistent save || true
  # DOCKER-USER guard via systemd (After=docker.service) so it persists across reboots.
  - systemctl daemon-reload || true
  - systemctl enable --now awarewave-docker-firewall.service || true
  - systemctl enable --now fail2ban || true
  - sysctl --system || true
  # Machine-readable acceptance report built from ACTUAL state (not a hardcoded string).
  - 'V4=$(iptables -S INPUT 2>/dev/null | grep -c "DROP"); V6=$(ip6tables -S INPUT 2>/dev/null | grep -c "DROP"); DU=$(iptables -S DOCKER-USER 2>/dev/null | grep -c "DROP"); printf ''{"input_drop_v4":%s,"input_drop_v6":%s,"docker_user_drop":%s,"ssh":"key-only","auto_reboot":"%s"}\\n'' "\${V4:-0}" "\${V6:-0}" "\${DU:-0}" "${rebootTime}" > /var/log/day1-hardening.json'
`;

  const bytes = Buffer.byteLength(userData, "utf8");
  if (bytes > CLOUD_INIT_MAX_BYTES) {
    throw new Error(
      `cloud-init user_data is ${bytes} bytes, exceeds Hetzner limit ${CLOUD_INIT_MAX_BYTES}`
    );
  }
  return { userData, bytes };
}
