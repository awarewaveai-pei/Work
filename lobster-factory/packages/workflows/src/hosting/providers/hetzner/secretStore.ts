import { generateKeyPairSync } from "node:crypto";
import type { ServerSecretStore } from "./HetznerHostingAdapter";

/**
 * Per-tenant SSH key generation + persistence.
 *
 * Security model (crypto-miner lesson + M7): the PRIVATE key is generated here and
 * handed to an injected `putSecret` sink (vault / EU-worker env wiring — that durable
 * persistence is Phase-4 integration). The adapter only ever receives the PUBLIC key
 * (for user_data) + a vault POINTER (`sshCredentialsRef`) — never the private key.
 */

function uint32be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

/**
 * Encode a raw 32-byte ed25519 public key into OpenSSH `authorized_keys` wire format:
 *   "ssh-ed25519 " + base64( string("ssh-ed25519") + string(rawPubKey) )
 */
export function rawEd25519ToOpenSsh(rawPub: Buffer, comment = ""): string {
  if (rawPub.length !== 32) throw new Error(`ed25519 public key must be 32 bytes, got ${rawPub.length}`);
  const keyType = Buffer.from("ssh-ed25519", "ascii");
  const blob = Buffer.concat([uint32be(keyType.length), keyType, uint32be(rawPub.length), rawPub]);
  const b64 = blob.toString("base64");
  return comment ? `ssh-ed25519 ${b64} ${comment}` : `ssh-ed25519 ${b64}`;
}

export type GeneratedKeyPair = {
  /** OpenSSH `ssh-ed25519 AAAA...` line for authorized_keys / user_data. */
  publicKeyOpenSsh: string;
  /** PKCS#8 PEM private key — SECRET. Never logged, never put in user_data. */
  privateKeyPem: string;
};

/** Generate a fresh ed25519 keypair. Pure (no I/O). */
export function generateEd25519KeyPair(comment = ""): GeneratedKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const der = publicKey as unknown as Buffer;
  // SPKI DER for ed25519 is a fixed 44-byte structure; the raw 32-byte key is the tail.
  const rawPub = der.subarray(der.length - 32);
  return {
    publicKeyOpenSsh: rawEd25519ToOpenSsh(rawPub, comment),
    privateKeyPem: privateKey as unknown as string,
  };
}

/** Sink that durably persists a private key under a ref (vault / worker env — Phase 4). */
export type PutSecret = (ref: string, privateKeyPem: string) => Promise<void>;

function refForSite(siteId: string): string {
  const norm = siteId.replace(/[^a-z0-9]/gi, "_").toUpperCase();
  if (!norm) throw new Error("refForSite: siteId is empty — refusing to create a colliding key ref");
  return `vault://LOBSTER_SSH_KEY_${norm}`;
}

/**
 * Build a `ServerSecretStore` backed by an injected persistence sink. The default sink
 * is intentionally a hard failure — durable persistence MUST be wired (Phase 4) before
 * a real billable provision, so we never generate a key we cannot later retrieve.
 */
export function createVaultSecretStore(putSecret?: PutSecret): ServerSecretStore {
  const sink: PutSecret =
    putSecret ??
    (async () => {
      throw new Error(
        "ServerSecretStore persistence sink not configured — wire putSecret (vault / EU-worker) before billable provisioning (PLAN Phase 4)."
      );
    });

  return {
    async generateAndStore(siteId: string) {
      const ref = refForSite(siteId);
      const { publicKeyOpenSsh, privateKeyPem } = generateEd25519KeyPair(`lobster-${siteId}`);
      await sink(ref, privateKeyPem);
      return { sshPublicKey: publicKeyOpenSsh, sshCredentialsRef: ref };
    },
  };
}
