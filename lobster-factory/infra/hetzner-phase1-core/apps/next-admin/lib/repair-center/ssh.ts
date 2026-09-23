import { Client as SshClient } from "ssh2";

export interface SshTarget {
  host: string;
  port: number;
  username: string;
  privateKey: string;
  // Expected host key, as ssh2's own `hostHash:'sha256'` digest: lowercase hex
  // sha256 of the raw host public key blob. NOT OpenSSH's `ssh-keygen -lf`
  // format (that's base64, "SHA256:xxxx") — the two are different encodings
  // of a similar idea and are not interchangeable. Get this value from ssh2
  // itself (see scripts/fetch-ssh-host-key-fingerprint.mjs), never derive it
  // by eye from `ssh-keygen -lf` output.
  //
  // 2026-09-23: added after WORKLOG 續106/107 found connectSsh() accepted
  // ANY host key — the same incident class where a retired IP got silently
  // reassigned to a third party who now answers SSH on it. Optional (not
  // required) so existing unpinned deployments keep working; connectSsh()
  // logs a warning to stderr when a target has no fingerprint so the gap is
  // visible, not silent. Every AUTO_REPAIR_* target this repo actually wires
  // up should set one (see readSshTarget below).
  hostKeyFingerprint?: string;
}

export interface SshExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function readPrivateKeyFromEnv(envName: string): string {
  const raw = process.env[envName]?.trim() ?? "";
  if (!raw) return "";
  if (raw.includes("BEGIN ") && raw.includes("PRIVATE KEY")) return raw;
  try {
    return Buffer.from(raw, "base64").toString("utf-8");
  } catch {
    return raw;
  }
}

export class HostKeyMismatchError extends Error {
  constructor(host: string, port: number) {
    super(`host_key_mismatch: ${host}:${port} presented a host key that does not match the pinned fingerprint`);
    this.name = "HostKeyMismatchError";
  }
}

export function connectSsh(opts: SshTarget): Promise<SshClient> {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    conn.on("ready", () => resolve(conn));
    conn.on("error", reject);
    if (opts.hostKeyFingerprint) {
      const expected = opts.hostKeyFingerprint.trim().toLowerCase();
      conn.connect({
        ...opts,
        hostHash: "sha256",
        hostVerifier: (fingerprintHex: string) => {
          const ok = fingerprintHex.toLowerCase() === expected;
          if (!ok) reject(new HostKeyMismatchError(opts.host, opts.port));
          return ok;
        },
      });
    } else {
      // eslint-disable-next-line no-console -- deliberately visible, not silent (see SshTarget doc above)
      console.warn(`ssh.ts: connecting to ${opts.host}:${opts.port} with no hostKeyFingerprint pinned — any host key is accepted`);
      conn.connect(opts);
    }
  });
}

/**
 * Resolve a platform VPS SSH target from AUTO_REPAIR_<prefix>_SSH_* env vars.
 * Single definition — backup gate, evidence probe, and remediation executor
 * all resolve targets through here. Returns null when not configured.
 *
 * Fail-closed on the host key (2026-09-23, WORKLOG 續116, codex-review round 3): this is the
 * ONE production entry point for the Auto-Repair SSH target (route.ts's health probes construct
 * their own SshTarget inline but apply the identical rule — see statRemoteScript there). Round 1
 * found connectSsh() accepted any host key by default; round 3 correctly rejected leaving that
 * unpinned-with-a-warning fallback reachable from here, since a missing/misconfigured env var
 * would silently degrade a privileged root SSH target to no host-key verification at all. A
 * target with host+key but no fingerprint is therefore treated exactly like "not configured" —
 * null, same as every existing caller already handles — rather than an object that would connect
 * unpinned. connectSsh() itself stays flexible (its own warn-and-proceed path is still real and
 * still logs loudly) because it is a general primitive; this function is the strict wrapper that
 * keeps the actual production callers from ever reaching that path.
 */
export function readSshTarget(prefix: "SG" | "EU"): SshTarget | null {
  const host = process.env[`AUTO_REPAIR_${prefix}_SSH_HOST`]?.trim() ?? "";
  const username = process.env[`AUTO_REPAIR_${prefix}_SSH_USER`]?.trim() || "root";
  const keyEnv = process.env[`AUTO_REPAIR_${prefix}_SSH_KEY_ENV`]?.trim() || `AUTO_REPAIR_${prefix}_SSH_KEY_B64`;
  const privateKey = readPrivateKeyFromEnv(keyEnv);
  if (!host || !privateKey) return null;
  const hostKeyFingerprint = process.env[`AUTO_REPAIR_${prefix}_SSH_HOST_KEY_SHA256`]?.trim() || "";
  if (!hostKeyFingerprint) {
    // eslint-disable-next-line no-console -- visible, not silent: this is why the SSH target went dark
    console.warn(
      `ssh.ts: AUTO_REPAIR_${prefix}_SSH_HOST_KEY_SHA256 is not set — treating the ${prefix} target as unconfigured rather than connecting unpinned`,
    );
    return null;
  }
  const rawPort = Number(process.env[`AUTO_REPAIR_${prefix}_SSH_PORT`]);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? Math.floor(rawPort) : 22;
  return { host, username, port, privateKey, hostKeyFingerprint };
}

/**
 * Connect, run one command, disconnect — with a hard wall-clock ceiling that
 * covers BOTH connect and exec. Read-only callers (evidence probe) depend on
 * this never hanging past timeoutMs.
 */
export async function sshExecOnce(
  target: SshTarget,
  command: string,
  timeoutMs = 10_000,
): Promise<SshExecResult> {
  let conn: SshClient | null = null;
  const work = (async () => {
    conn = await connectSsh(target);
    return await sshExec(conn, command);
  })();
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`ssh_exec_timeout_${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  } finally {
    try {
      (conn as SshClient | null)?.end();
    } catch {
      /* ignore */
    }
  }
}

export function sshExec(conn: SshClient, command: string): Promise<SshExecResult> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      stream.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      stream.on("close", (code: number) => resolve({ code: code ?? 0, stdout, stderr }));
    });
  });
}
