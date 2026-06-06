import { describe, it, expect } from "vitest";
import {
  generateEd25519KeyPair,
  rawEd25519ToOpenSsh,
  createVaultSecretStore,
} from "./secretStore";

describe("generateEd25519KeyPair", () => {
  it("produces an OpenSSH ed25519 public key + PKCS8 private key", () => {
    const kp = generateEd25519KeyPair("comment");
    expect(kp.publicKeyOpenSsh.startsWith("ssh-ed25519 ")).toBe(true);
    expect(kp.publicKeyOpenSsh).toContain("comment");
    expect(kp.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    // the public key line must NOT contain private material
    expect(kp.publicKeyOpenSsh).not.toMatch(/PRIVATE/);
  });

  it("public key decodes to the correct OpenSSH wire format", () => {
    const kp = generateEd25519KeyPair();
    const b64 = kp.publicKeyOpenSsh.split(" ")[1];
    const blob = Buffer.from(b64, "base64");
    // uint32 len + "ssh-ed25519" + uint32 len + 32-byte key
    const t1 = blob.readUInt32BE(0);
    expect(t1).toBe(11);
    expect(blob.subarray(4, 4 + 11).toString("ascii")).toBe("ssh-ed25519");
    const klen = blob.readUInt32BE(4 + 11);
    expect(klen).toBe(32);
    expect(blob.length).toBe(4 + 11 + 4 + 32);
  });

  it("generates a different key each call", () => {
    const a = generateEd25519KeyPair();
    const b = generateEd25519KeyPair();
    expect(a.publicKeyOpenSsh).not.toBe(b.publicKeyOpenSsh);
  });

  it("rawEd25519ToOpenSsh rejects a wrong-length key", () => {
    expect(() => rawEd25519ToOpenSsh(Buffer.alloc(16))).toThrow(/32 bytes/);
  });
});

describe("createVaultSecretStore", () => {
  it("generates, persists via the sink, and returns pubkey + vault ref (never the private key)", async () => {
    const persisted: Array<{ ref: string; pk: string }> = [];
    const store = createVaultSecretStore(async (ref, pk) => {
      persisted.push({ ref, pk });
    });
    const r = await store.generateAndStore("00000000-0000-0000-0000-000000000001");
    expect(r.sshPublicKey.startsWith("ssh-ed25519 ")).toBe(true);
    expect(r.sshCredentialsRef).toBe("vault://LOBSTER_SSH_KEY_00000000_0000_0000_0000_000000000001");
    // private key went to the sink, NOT into the returned object
    expect(JSON.stringify(r)).not.toMatch(/PRIVATE/);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].pk).toContain("BEGIN PRIVATE KEY");
  });

  it("default sink throws — never generate a key we cannot retrieve (Phase 4 guard)", async () => {
    const store = createVaultSecretStore();
    await expect(store.generateAndStore("site-x")).rejects.toThrow(/persistence sink not configured/);
  });
});
