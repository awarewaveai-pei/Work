import { Client as SshClient } from "ssh2";

export interface SshTarget {
  host: string;
  port: number;
  username: string;
  privateKey: string;
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

export function connectSsh(opts: SshTarget): Promise<SshClient> {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    conn.on("ready", () => resolve(conn));
    conn.on("error", reject);
    conn.connect(opts);
  });
}

/**
 * Resolve a platform VPS SSH target from AUTO_REPAIR_<prefix>_SSH_* env vars.
 * Single definition — backup gate, evidence probe, and remediation executor
 * all resolve targets through here. Returns null when not configured.
 */
export function readSshTarget(prefix: "SG" | "EU"): SshTarget | null {
  const host = process.env[`AUTO_REPAIR_${prefix}_SSH_HOST`]?.trim() ?? "";
  const username = process.env[`AUTO_REPAIR_${prefix}_SSH_USER`]?.trim() || "root";
  const keyEnv = process.env[`AUTO_REPAIR_${prefix}_SSH_KEY_ENV`]?.trim() || `AUTO_REPAIR_${prefix}_SSH_KEY_B64`;
  const privateKey = readPrivateKeyFromEnv(keyEnv);
  if (!host || !privateKey) return null;
  const rawPort = Number(process.env[`AUTO_REPAIR_${prefix}_SSH_PORT`]);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? Math.floor(rawPort) : 22;
  return { host, username, port, privateKey };
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
