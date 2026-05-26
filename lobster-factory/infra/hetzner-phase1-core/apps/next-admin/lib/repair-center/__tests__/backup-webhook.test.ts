import { describe, expect, it } from "vitest";

/**
 * M5: unit tests for backup webhook integrity validation.
 * Tests the guard logic in isolation using the same decision path
 * as backup.ts runPreRepairBackup webhook branch.
 */

interface BackupWebhookResult {
  ok: boolean;
  backupRef?: string;
  error?: string;
  detail?: Record<string, unknown>;
}

/** Mirrors the decision logic from backup.ts webhook branch. */
function evaluateWebhookResponse(
  httpOk: boolean,
  jsonParsed: boolean,
  payload: Record<string, unknown> | null,
  runId = "test-run-id",
): BackupWebhookResult {
  if (!httpOk || payload?.ok === false) {
    return {
      ok: false,
      error: String(payload?.error ?? `backup_webhook_${httpOk ? 200 : 500}`),
      detail: payload ?? {},
    };
  }

  const backupRef = String(payload?.backup_id ?? payload?.backupRef ?? payload?.backup_ref ?? "");

  if (!jsonParsed || !backupRef) {
    return {
      ok: false,
      error: "backup_webhook_no_ref",
      detail: { ...payload, jsonParsed, note: "Webhook returned 200 but backup_id / backup_ref missing from JSON." },
    };
  }

  const sizeBytes = typeof payload?.size_bytes === "number" ? payload.size_bytes : null;
  if (sizeBytes !== null && sizeBytes < 1024) {
    return {
      ok: false,
      error: "backup_webhook_size_too_small",
      detail: { ...payload, size_bytes: sizeBytes, minimum: 1024 },
    };
  }

  return { ok: true, backupRef, detail: payload ?? {} };
}

describe("M5: backup webhook integrity gate", () => {
  it("accepts valid JSON response with backup_id", () => {
    const result = evaluateWebhookResponse(true, true, { backup_id: "bkp_abc123", size_bytes: 2048 });
    expect(result.ok).toBe(true);
    expect(result.backupRef).toBe("bkp_abc123");
  });

  it("accepts valid JSON response with backup_ref alias", () => {
    const result = evaluateWebhookResponse(true, true, { backup_ref: "bkp_xyz" });
    expect(result.ok).toBe(true);
    expect(result.backupRef).toBe("bkp_xyz");
  });

  it("rejects 200 HTML response (Cloudflare maintenance / nginx default page)", () => {
    // json parse fails → jsonParsed=false, payload={ text: "<html>..." }
    const result = evaluateWebhookResponse(true, false, { text: "<html><body>503 Maintenance</body></html>" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("backup_webhook_no_ref");
  });

  it("rejects 200 JSON with no backup ref fields", () => {
    // Webhook returns { status: "ok" } but no backup_id / backup_ref
    const result = evaluateWebhookResponse(true, true, { status: "ok" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("backup_webhook_no_ref");
  });

  it("rejects 200 JSON with ok:false explicit failure", () => {
    const result = evaluateWebhookResponse(true, true, { ok: false, error: "disk_full" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("disk_full");
  });

  it("rejects 4xx/5xx responses regardless of body", () => {
    const result = evaluateWebhookResponse(false, true, { backup_id: "bkp_abc" });
    expect(result.ok).toBe(false);
  });

  it("rejects backup with size_bytes < 1024 (Plan §六: minimum 1KB)", () => {
    const result = evaluateWebhookResponse(true, true, { backup_id: "bkp_tiny", size_bytes: 512 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("backup_webhook_size_too_small");
  });

  it("accepts backup with size_bytes exactly 1024", () => {
    const result = evaluateWebhookResponse(true, true, { backup_id: "bkp_ok", size_bytes: 1024 });
    expect(result.ok).toBe(true);
  });

  it("accepts backup with no size_bytes field (field is optional)", () => {
    const result = evaluateWebhookResponse(true, true, { backup_id: "bkp_no_size" });
    expect(result.ok).toBe(true);
  });

  it("rejects 200 with empty text body (e.g., misconfigured webhook endpoint)", () => {
    const result = evaluateWebhookResponse(true, false, { text: "" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("backup_webhook_no_ref");
  });
});
