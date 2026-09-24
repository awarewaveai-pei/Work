// Centralised error reporting: error_events (DLQ) + Sentry. The silentSentry
// flag and the client/organizationId early-return are the two branches that
// decide whether a failure is actually visible anywhere -- worth pinning.
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { reportCommandError } from "../errorReporting";

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

function fakeSb(insertResult: { error: unknown }) {
  const insert = vi.fn(async (_row: unknown) => insertResult);
  const from = vi.fn((table: string) => {
    if (table !== "error_events") throw new Error(`unexpected table ${table}`);
    return { insert };
  });
  return { sb: { from } as unknown as SupabaseClient, insert };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reportCommandError -- Sentry", () => {
  it("captures a Sentry message by default", async () => {
    const { sb } = fakeSb({ error: null });
    await reportCommandError(sb, {
      organizationId: "org-1",
      source_type: "command_handler_failed",
      source_ref: "req-1",
      error_code: "handler_threw",
      error_message: "boom",
    });
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "[command-plane] command_handler_failed: boom",
      expect.objectContaining({ level: "error" }),
    );
  });

  it("does NOT capture a Sentry message when silentSentry is set (high-volume/low-signal class)", async () => {
    const { sb } = fakeSb({ error: null });
    await reportCommandError(sb, {
      organizationId: null,
      source_type: "telegram_auth_failed",
      source_ref: null,
      error_code: "secret_mismatch",
      error_message: "bad secret",
      silentSentry: true,
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe("reportCommandError -- error_events write", () => {
  it("skips the DB write entirely when client is null (auth failures may have no org context)", async () => {
    await reportCommandError(null, {
      organizationId: "org-1",
      source_type: "telegram_auth_failed",
      source_ref: null,
      error_code: "secret_mismatch",
      error_message: "bad secret",
    });
    // No throw, and nothing to assert on a null client -- the absence of a crash IS the assertion.
  });

  it("skips the DB write when organizationId is null even with a real client", async () => {
    const { sb, insert } = fakeSb({ error: null });
    await reportCommandError(sb, {
      organizationId: null,
      source_type: "telegram_auth_failed",
      source_ref: null,
      error_code: "secret_mismatch",
      error_message: "bad secret",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("writes error_events with the given fields when client + organizationId are present", async () => {
    const { sb, insert } = fakeSb({ error: null });
    await reportCommandError(sb, {
      organizationId: "org-1",
      source_type: "command_ingress_failed",
      source_ref: "telegram:evt-1",
      error_code: "claim_failed",
      error_message: "db unreachable",
      event_payload: { command: "/status" },
      trace_ref: "trace-1",
    });
    expect(insert).toHaveBeenCalledWith({
      organization_id: "org-1",
      source_type: "command_ingress_failed",
      source_ref: "telegram:evt-1",
      error_code: "claim_failed",
      error_message: "db unreachable",
      trace_ref: "trace-1",
      event_payload: { command: "/status" },
    });
  });

  it("reports a Sentry exception (in addition to the earlier message) when the error_events insert itself fails", async () => {
    const { sb } = fakeSb({ error: { message: "insert failed" } });
    await reportCommandError(sb, {
      organizationId: "org-1",
      source_type: "command_handler_failed",
      source_ref: "req-1",
      error_code: "handler_threw",
      error_message: "boom",
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
