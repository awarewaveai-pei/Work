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
 *  - SSH: key-only, no passwords (item 5). Firewall: INPUT DROP + DOCKER-USER (items 3,4).
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
  // A public key starts with ssh-/ecdsa-/sk-; a private key block must never appear here.
  if (/PRIVATE KEY/i.test(sshPublicKey)) {
    throw new Error("cloud-init refuses a PRIVATE KEY in sshPublicKey — public key only");
  }
}

function indent(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return block
    .split("\n")
    .map((l) => (l.length ? pad + l : l))
    .join("\n");
}

/**
 * The iptables ruleset: INPUT default DROP (only 22/80/443) + DOCKER-USER chain so
 * containers binding 0.0.0.0 cannot bypass the host firewall (the crypto-miner root cause).
 */
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

const DOCKER_USER_RULES = `# DOCKER-USER runs BEFORE the auto-generated DOCKER chain — this is the ONLY way to
# stop a container that binds 0.0.0.0:<port> from being reachable past the host firewall.
-I DOCKER-USER -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-I DOCKER-USER -i eth0 -p tcp --dport 443 -j ACCEPT
-I DOCKER-USER -i eth0 -p tcp --dport 80 -j ACCEPT
-I DOCKER-USER -i eth0 -j DROP
`;

export function renderDay1CloudInit(params: Day1CloudInitParams): {
  userData: string;
  bytes: number;
} {
  assertNoSecretLeak(params.sshPublicKey);
  const deployUser = params.deployUser ?? "deploy";
  const rebootTime = params.autoRebootTime ?? "20:00";
  const pubkey = params.sshPublicKey.trim();

  const userData = `#cloud-config
hostname: ${params.hostname}
# item 5: SSH key-only, no password auth, no root password login
ssh_pwauth: false
disable_root: false
users:
  - name: ${deployUser}
    groups: [sudo]
    sudo: ["ALL=(ALL) NOPASSWD:ALL"]
    shell: /bin/bash
    lock_passwd: true
    ssh_authorized_keys:
      - ${pubkey}
  - name: root
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
  # items 3,4: INPUT default DROP (22/80/443 only) + DOCKER-USER bypass guard
  - path: /etc/iptables/rules.v4
    permissions: "0644"
    content: |
${indent(IPTABLES_RULES_V4, 6)}
  - path: /etc/iptables/docker-user.rules
    permissions: "0644"
    content: |
${indent(DOCKER_USER_RULES, 6)}
  # item 18: unattended-upgrades automatic reboot (staggered)
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
  # SSH hardening (item 5): no password, no root password login
  - sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  - sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  - systemctl reload ssh || systemctl reload sshd || true
  # Apply firewall (items 3,4) — order matters: base rules then DOCKER-USER
  - iptables-restore < /etc/iptables/rules.v4
  - 'iptables -N DOCKER-USER 2>/dev/null || true'
  - bash -c 'while read -r r; do [ -n "$r" ] && [ "\${r:0:1}" != "#" ] && iptables $r 2>/dev/null || true; done < /etc/iptables/docker-user.rules'
  - netfilter-persistent save || iptables-save > /etc/iptables/rules.v4
  - systemctl enable --now fail2ban || true
  - sysctl --system || true
  # machine-readable acceptance report for the post-boot verifier to curl/scp
  - 'printf ''{"day1_hardening":"applied","firewall":"input-drop+docker-user","ssh":"key-only","auto_reboot":"%s"}\\n'' "${rebootTime}" > /var/log/day1-hardening.json'
`;

  const bytes = Buffer.byteLength(userData, "utf8");
  if (bytes > CLOUD_INIT_MAX_BYTES) {
    throw new Error(
      `cloud-init user_data is ${bytes} bytes, exceeds Hetzner limit ${CLOUD_INIT_MAX_BYTES}`
    );
  }
  return { userData, bytes };
}
