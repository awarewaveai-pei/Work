// Anti-drift contract (T19): this fixture is SHARED with the workflows package
// (lobster-factory/packages/workflows/src/lib/systemMode.test.ts), which drives its own
// getActiveMode/evaluateAtHigh against the exact same cases. Both suites must agree with
// lib/command-plane/killSwitch.ts's getActiveMode + evaluateKillSwitch("high") -- the semantics
// the workflows dispatcher re-implements (it cannot import next-admin code at runtime). A change
// to killSwitch.ts's rule without updating the fixture (or updating both sides to match) fails one
// of the two suites, not silently drifting apart.
import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { evaluateKillSwitch, getActiveMode } from "@/lib/command-plane/killSwitch";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

interface Case {
  name: string;
  organizationId: string | null;
  rows: Array<{ scope_type: string; scope_id: string | null; mode: string }> | null;
  dbError: boolean;
  expectedMode: string;
  expectedBlocks: boolean;
}

// Relative to this file: apps/next-admin -> apps -> hetzner-phase1-core -> infra ->
// lobster-factory, then down into packages/workflows/src/lib/__fixtures__.
const FIXTURE_PATH = path.resolve(
  __dirname,
  "../../../../../../../packages/workflows/src/lib/__fixtures__/system-mode-cases.json",
);

function fakeSb(
  rows: Array<{ scope_type: string; scope_id: string | null; mode: string }> | null,
  error: unknown = null,
) {
  const or = vi.fn(async () => ({ data: rows, error }));
  const is = vi.fn(async () => ({ data: rows, error }));
  const eq = vi.fn(() => ({ is }));
  const select = vi.fn(() => ({ or, eq }));
  const from = vi.fn(() => ({ select }));
  return { from } as unknown as SupabaseClient;
}

describe("killSwitch -- shared fixture parity (system-mode-cases.json)", () => {
  it("the fixture path resolves and has more than a handful of cases (a broken relative path would silently run 0)", () => {
    expect(fs.existsSync(FIXTURE_PATH), FIXTURE_PATH).toBe(true);
    const cases: Case[] = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
    expect(cases.length).toBeGreaterThan(5);
  });

  const cases: Case[] = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  for (const c of cases) {
    it(c.name, async () => {
      const sb = fakeSb(c.dbError ? null : c.rows, c.dbError ? { message: "boom" } : null);
      const mode = await getActiveMode(sb, c.organizationId);
      expect(mode).toBe(c.expectedMode);
      expect(evaluateKillSwitch(mode, "high").blocks).toBe(c.expectedBlocks);
    });
  }
});
