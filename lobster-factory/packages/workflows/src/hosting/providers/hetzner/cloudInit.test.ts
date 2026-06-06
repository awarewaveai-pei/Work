import { describe, it, expect } from "vitest";
import { renderDay1CloudInit, CLOUD_INIT_MAX_BYTES } from "./cloudInit";

const PUBKEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyDataForTestingOnly test@lobster";

const BASE = {
  sshPublicKey: PUBKEY,
  hostname: "lf-stg-sin-acme-shop",
};

describe("renderDay1CloudInit", () => {
  it("renders a #cloud-config under the 32 KiB Hetzner limit", () => {
    const { userData, bytes } = renderDay1CloudInit(BASE);
    expect(userData.startsWith("#cloud-config")).toBe(true);
    expect(bytes).toBeLessThanOrEqual(CLOUD_INIT_MAX_BYTES);
    expect(bytes).toBeGreaterThan(0);
  });

  it("encodes the bare-metal hardening directives (items 3/4/5/18)", () => {
    const { userData } = renderDay1CloudInit(BASE);
    // item 5: no password auth (via cloud-init module + sshd_config.d drop-in)
    expect(userData).toContain("ssh_pwauth: false");
    expect(userData).toContain("PasswordAuthentication no");
    expect(userData).toContain("/etc/ssh/sshd_config.d/99-awarewave-hardening.conf");
    // items 3,4: INPUT DROP + DOCKER-USER bypass guard
    expect(userData).toContain(":INPUT DROP");
    expect(userData).toContain("DOCKER-USER");
    expect(userData).toContain("--dport 22 -j ACCEPT");
    expect(userData).toContain("--dport 443 -j ACCEPT");
    // item 18: auto-reboot
    expect(userData).toContain('Automatic-Reboot "true"');
    // acceptance report for post-boot verifier
    expect(userData).toContain("/var/log/day1-hardening.json");
  });

  it("hardens BOTH IPv4 and IPv6 (Hetzner gives a public /64 — v6 must not be open)", () => {
    const { userData } = renderDay1CloudInit(BASE);
    expect(userData).toContain("/etc/iptables/rules.v6");
    expect(userData).toContain("ip6tables-restore < /etc/iptables/rules.v6");
    expect(userData).toContain("ipv6-icmp"); // NDP/PMTUD must stay open for v6 to work
    // DOCKER-USER guard persisted via systemd ordered after docker (survives reboot)
    expect(userData).toContain("awarewave-docker-firewall.service");
    expect(userData).toContain("After=docker.service");
    // the script applies the guard to both stacks
    expect(userData).toContain("for ipt in iptables ip6tables");
  });

  it("least privilege: only the non-root deploy user gets the key; root login disabled", () => {
    const { userData } = renderDay1CloudInit(BASE);
    expect(userData).toContain("disable_root: true");
    expect(userData).toContain("PermitRootLogin no");
    expect(userData).toContain("name: deploy");
    // no separate `name: root` user block granting key login
    expect(userData).not.toMatch(/- name: root/);
  });

  it("acceptance report reflects ACTUAL iptables state, not a hardcoded string", () => {
    const { userData } = renderDay1CloudInit(BASE);
    expect(userData).toContain("iptables -S INPUT");
    expect(userData).toContain("ip6tables -S INPUT");
    expect(userData).toContain('"input_drop_v6"');
  });

  it("embeds the per-tenant public key and hostname", () => {
    const { userData } = renderDay1CloudInit(BASE);
    expect(userData).toContain(PUBKEY);
    expect(userData).toContain("hostname: lf-stg-sin-acme-shop");
  });

  it("respects a custom staggered reboot time", () => {
    const { userData } = renderDay1CloudInit({ ...BASE, autoRebootTime: "20:30" });
    expect(userData).toContain('Automatic-Reboot-Time "20:30"');
  });

  it("REFUSES a private key (secret-leak guard) — user_data is metadata-readable", () => {
    expect(() =>
      renderDay1CloudInit({
        ...BASE,
        sshPublicKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----",
      })
    ).toThrow(/PRIVATE KEY/);
  });

  it("never embeds a known secret marker", () => {
    const { userData } = renderDay1CloudInit(BASE);
    expect(userData).not.toMatch(/PRIVATE KEY/i);
    expect(userData).not.toMatch(/HETZNER_(STAGING|PROD)_TOKEN/);
  });

  it("is deterministic for the same input", () => {
    const a = renderDay1CloudInit(BASE);
    const b = renderDay1CloudInit(BASE);
    expect(a.userData).toBe(b.userData);
  });
});
