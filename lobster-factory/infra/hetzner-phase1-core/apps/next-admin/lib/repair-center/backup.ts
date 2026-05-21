import type { RepairRunWithIncident } from "./types";
import { connectSsh, readPrivateKeyFromEnv, sshExec, type SshTarget } from "./ssh";

export interface BackupGateResult {
  ok: boolean;
  backupRef?: string;
  error?: string;
  detail?: Record<string, unknown>;
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export async function runPreRepairBackup(run: RepairRunWithIncident): Promise<BackupGateResult> {
  const url = env("AUTO_REPAIR_BACKUP_WEBHOOK_URL");
  const token = env("AUTO_REPAIR_BACKUP_WEBHOOK_TOKEN");

  if (!url) {
    return runSshBackupGate(run);
  }

  const body = {
    repair_run_id: run.id,
    incident_id: run.incident_id,
    source: run.source,
    client_slug: run.client_slug,
    title: run.incident?.title,
    fingerprint: run.incident?.fingerprint,
    requested_at: new Date().toISOString(),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      payload = { text: await res.text().catch(() => "") };
    }

    if (!res.ok || payload?.ok === false) {
      return {
        ok: false,
        error: payload?.error ?? `backup_webhook_${res.status}`,
        detail: payload ?? {},
      };
    }

    const backupRef = String(payload?.backup_id ?? payload?.backupRef ?? payload?.backup_ref ?? "");
    return {
      ok: true,
      backupRef: backupRef || `pre-repair:${run.id}`,
      detail: payload ?? {},
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function safeScriptPath(raw: string, fallback: string): string {
  const value = raw.trim() || fallback;
  if (!/^[/A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error(`unsafe_script_path:${value}`);
  }
  return value;
}

function readSshTarget(prefix: "SG" | "EU"): SshTarget | null {
  const host = env(`AUTO_REPAIR_${prefix}_SSH_HOST`);
  const username = env(`AUTO_REPAIR_${prefix}_SSH_USER`) || "root";
  const keyEnv = env(`AUTO_REPAIR_${prefix}_SSH_KEY_ENV`) || `AUTO_REPAIR_${prefix}_SSH_KEY_B64`;
  const privateKey = readPrivateKeyFromEnv(keyEnv);
  if (!host || !privateKey) return null;
  return {
    host,
    username,
    port: positiveIntEnv(`AUTO_REPAIR_${prefix}_SSH_PORT`, 22),
    privateKey,
  };
}

async function runRemoteScript(args: {
  label: "sg" | "eu";
  target: SshTarget;
  command: string;
}): Promise<{ ok: boolean; stdout: string; stderr: string; code: number }> {
  const conn = await connectSsh(args.target);
  try {
    const result = await sshExec(conn, args.command);
    return {
      ok: result.code === 0,
      stdout: result.stdout.slice(-6000),
      stderr: result.stderr.slice(-6000),
      code: result.code,
    };
  } finally {
    conn.end();
  }
}

function describeSshExitCode(code: number, stderr: string): string {
  if (code === 127) return "script_not_found";
  if (code === 255) return "ssh_connection_failed";
  if (/permission denied/i.test(stderr)) return "ssh_permission_denied";
  if (/no such file/i.test(stderr)) return "path_not_found";
  return `exit_${code}`;
}

async function runSshBackupGate(run: RepairRunWithIncident): Promise<BackupGateResult> {
  const sg = readSshTarget("SG");
  const eu = readSshTarget("EU");
  const requireEu = boolEnv("AUTO_REPAIR_REQUIRE_EU_BACKUP", true);

  if (!sg) {
    return {
      ok: false,
      error: "backup_gate_not_configured",
      detail: {
        missing: ["AUTO_REPAIR_BACKUP_WEBHOOK_URL", "AUTO_REPAIR_SG_SSH_HOST", "AUTO_REPAIR_SG_SSH_KEY_B64"],
        invariant: "No backup means no repair run and no GitHub issue.",
      },
    };
  }
  if (requireEu && !eu) {
    return {
      ok: false,
      error: "eu_backup_gate_not_configured",
      detail: {
        missing: ["AUTO_REPAIR_EU_SSH_HOST", "AUTO_REPAIR_EU_SSH_KEY_B64"],
        note: "Set AUTO_REPAIR_REQUIRE_EU_BACKUP=false only for a deliberate SG-only drill.",
      },
    };
  }

  const sgRoot = safeScriptPath(env("AUTO_REPAIR_SG_PHASE1_ROOT"), "/root/lobster-phase1");
  const sgBackup = safeScriptPath(env("AUTO_REPAIR_SG_BACKUP_SCRIPT"), "./scripts/backup-phase1.sh");
  const sgVerify = safeScriptPath(env("AUTO_REPAIR_SG_VERIFY_SCRIPT"), "./scripts/verify-backup.sh");
  const euBackup = safeScriptPath(env("AUTO_REPAIR_EU_BACKUP_SCRIPT"), "/root/scripts/backup-eu-stack.sh");
  const euVerify = safeScriptPath(env("AUTO_REPAIR_EU_VERIFY_SCRIPT"), "/root/scripts/verify-backup-eu.sh");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  const backupRef = `pre-repair-${stamp}-${run.source}-${run.id.slice(0, 8)}`;

  const sgCommand = `cd ${sgRoot} && ${sgBackup} && ${sgVerify}`;
  const detail: Record<string, unknown> = { mode: "ssh", backup_ref: backupRef, sg_command: sgCommand };

  try {
    const sgResult = await runRemoteScript({ label: "sg", target: sg, command: sgCommand });
    detail.sg = sgResult;
    if (!sgResult.ok) {
      return { ok: false, error: `sg_backup_failed:${describeSshExitCode(sgResult.code, sgResult.stderr)}`, detail };
    }

    if (eu) {
      const euCommand = `${euBackup} && ${euVerify}`;
      detail.eu_command = euCommand;
      const euResult = await runRemoteScript({ label: "eu", target: eu, command: euCommand });
      detail.eu = euResult;
      if (!euResult.ok) {
        return { ok: false, error: `eu_backup_failed:${describeSshExitCode(euResult.code, euResult.stderr)}`, detail };
      }
    } else {
      detail.eu = { skipped: true, reason: "AUTO_REPAIR_REQUIRE_EU_BACKUP=false" };
    }

    return { ok: true, backupRef, detail };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e), detail };
  }
}
