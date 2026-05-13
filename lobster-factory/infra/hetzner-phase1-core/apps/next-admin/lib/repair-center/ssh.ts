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
