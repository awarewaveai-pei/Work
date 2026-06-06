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
    // item 5: no password auth
    expect(userData).toContain("ssh_pwauth: false");
    expect(userData).toContain("PasswordAuthentication no");
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
