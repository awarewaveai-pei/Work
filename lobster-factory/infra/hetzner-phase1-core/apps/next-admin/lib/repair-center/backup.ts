import type { RepairRunWithIncident } from "./types";

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
    return {
      ok: false,
      error: "backup_webhook_not_configured",
      detail: {
        expected_env: "AUTO_REPAIR_BACKUP_WEBHOOK_URL",
        invariant: "No backup means no repair run and no GitHub issue.",
      },
    };
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
