import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOrgSystemMode, evaluateAtHigh, getActiveMode } from "./systemMode";

// Anti-drift contract (T19): this fixture is ALSO loaded by next-admin's
// lib/system-modes/__tests__/system-mode-fixture-parity.test.ts against killSwitch.ts's own
// getActiveMode/evaluateKillSwitch("high"). A change to one side's semantics without updating the
// fixture (or updating both sides to match) fails one of the two suites.
interface Case {
  name: string;
  organizationId: string | null;
  rows: Array<{ scope_type: string; scope_id: string | null; mode: string }> | null;
  dbError: boolean;
  expectedMode: string;
  expectedBlocks: boolean;
}

const FIXTURE_PATH = path.join(__dirname, "__fixtures__", "system-mode-cases.json");
const cases: Case[] = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

const CREDS = { supabaseUrl: "https://x.supabase.co", serviceRoleKey: "test-key" };
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("systemMode -- shared fixture parity (system-mode-cases.json)", () => {
  it("the fixture loaded and has more than a handful of cases (a broken build would silently run 0)", () => {
    expect(cases.length).toBeGreaterThan(5);
  });

  for (const c of cases) {
    it(c.name, async () => {
      global.fetch = vi.fn(async () =>
        c.dbError
          ? new Response("boom", { status: 500 })
          : new Response(JSON.stringify(c.rows ?? []), { status: 200 }),
      ) as unknown as typeof fetch;

      const decision = await checkOrgSystemMode(CREDS, c.organizationId);
      expect(decision.mode).toBe(c.expectedMode);
      expect(decision.blocks).toBe(c.expectedBlocks);
    });
  }
});

describe("systemMode -- unit behavior", () => {
  it("getActiveMode + evaluateAtHigh compose the same way checkOrgSystemMode does", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch;
    const mode = await getActiveMode(CREDS, null);
    expect(evaluateAtHigh(mode)).toEqual({ mode: "normal", blocks: false });
  });

  it("a network throw (not just a non-ok status) also fails closed to unavailable", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const decision = await checkOrgSystemMode(CREDS, "00000000-0000-4000-8000-000000000001");
    expect(decision).toEqual({ mode: "unavailable", blocks: true, reason: "system_modes unreadable (fail closed)" });
  });
});
