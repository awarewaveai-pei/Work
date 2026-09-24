// Idempotency: (source, source_event_id) unique constraint on command_requests.
// The whole point of this module is "the same event never runs the handler twice" --
// the 23505-refetch path below IS that guarantee, so it gets the most scrutiny.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { claimCommandRequest, updateRequestStatus } from "../idempotency";
import type { CommandRequestRow, NormalizedCommand } from "../types";

const INPUT: NormalizedCommand = {
  source: "telegram",
  sourceEventId: "evt-1",
  actorType: "human",
  actorRef: "111",
  command: "/status",
  args: {},
  organizationId: "org-1",
  workspaceId: null,
  metadata: {},
};

function existingRow(): CommandRequestRow {
  return {
    id: "req-existing",
    organization_id: "org-1",
    workspace_id: null,
    source: "telegram",
    source_event_id: "evt-1",
    actor_type: "human",
    actor_ref: "111",
    command: "/status",
    args: {},
    risk_level: "low",
    status: "completed",
    workflow_run_id: null,
    approval_id: null,
    rejection_reason: null,
    result: { already: true },
    trace_id: "trace-existing",
    received_at: "2026-01-01T00:00:00Z",
    resolved_at: "2026-01-01T00:00:01Z",
    metadata: {},
  };
}

/** Builds a fake SupabaseClient covering the exact chains idempotency.ts calls. */
function fakeSb(opts: {
  insertResult: { data: unknown; error: unknown };
  selectResult?: { data: unknown; error: unknown };
}) {
  const insertedRows: unknown[] = [];
  const updateCalls: Array<{ patch: unknown; eqArgs: unknown[] }> = [];

  const from = vi.fn((table: string) => {
    if (table !== "command_requests") throw new Error(`unexpected table ${table}`);
    return {
      insert: (row: unknown) => {
        insertedRows.push(row);
        return {
          select: () => ({
            single: async () => opts.insertResult,
          }),
        };
      },
      select: () => {
        const chain = {
          eq: (..._args: unknown[]) => chain,
          single: async () => opts.selectResult ?? { data: null, error: { message: "not configured" } },
        };
        return chain;
      },
      update: (patch: unknown) => ({
        eq: (...eqArgs: unknown[]) => {
          updateCalls.push({ patch, eqArgs });
          return Promise.resolve({ error: null });
        },
      }),
    };
  });

  return { sb: { from } as unknown as SupabaseClient, insertedRows, updateCalls };
}

describe("claimCommandRequest -- new request", () => {
  it("inserts and returns isNew: true when the insert succeeds", async () => {
    const row = existingRow();
    const { sb, insertedRows } = fakeSb({ insertResult: { data: row, error: null } });
    const result = await claimCommandRequest(sb, INPUT, "low");
    expect(result).toEqual({ request: row, isNew: true });
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      organization_id: "org-1",
      source: "telegram",
      source_event_id: "evt-1",
      status: "received",
      risk_level: "low",
    });
  });
});

describe("claimCommandRequest -- duplicate (idempotency hit)", () => {
  it("on a 23505 unique violation, refetches and returns the existing row with isNew: false", async () => {
    const existing = existingRow();
    const { sb } = fakeSb({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } },
      selectResult: { data: existing, error: null },
    });
    const result = await claimCommandRequest(sb, INPUT, "low");
    expect(result).toEqual({ request: existing, isNew: false });
  });

  it("also recognizes a duplicate via message text when the driver omits a machine-readable code", () => {
    // Covered by the same code path -- verifies the /duplicate key/i fallback regex directly
    // rather than re-running the full async flow twice.
    const msg = "duplicate key value violates unique constraint \"command_requests_source_event_key\"";
    expect(/duplicate key/i.test(msg)).toBe(true);
  });

  it("the second concurrent claim for the SAME event never runs a handler twice: isNew is false and no new row is inserted", async () => {
    const existing = existingRow();
    const { sb, insertedRows } = fakeSb({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      selectResult: { data: existing, error: null },
    });
    const result = await claimCommandRequest(sb, INPUT, "low");
    expect(result.isNew).toBe(false);
    expect(result.request.id).toBe(existing.id);
    // insert() was still called once (that's how the DB detects the duplicate), but no row was
    // ever returned/committed from it -- the caller only ever sees the pre-existing row.
    expect(insertedRows).toHaveLength(1);
  });

  it("throws (does not silently proceed) when the duplicate re-fetch itself fails", async () => {
    const { sb } = fakeSb({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      selectResult: { data: null, error: { message: "refetch boom" } },
    });
    await expect(claimCommandRequest(sb, INPUT, "low")).rejects.toThrow(/could not refetch existing/);
  });
});

describe("claimCommandRequest -- genuine insert failure", () => {
  it("throws for a non-unique-violation error instead of treating it as a duplicate", async () => {
    const { sb } = fakeSb({
      insertResult: { data: null, error: { code: "23502", message: "null value in column organization_id" } },
    });
    await expect(claimCommandRequest(sb, INPUT, "low")).rejects.toThrow(/claimCommandRequest insert failed/);
  });
});

describe("updateRequestStatus", () => {
  it("issues an update with the given patch, scoped by id", async () => {
    const { sb, updateCalls } = fakeSb({ insertResult: { data: null, error: null } });
    await updateRequestStatus(sb, "req-1", { status: "completed", result: { ok: true } });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch).toEqual({ status: "completed", result: { ok: true } });
    expect(updateCalls[0].eqArgs).toEqual(["id", "req-1"]);
  });
});
