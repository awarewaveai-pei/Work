import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readBackupCoverage } from "../coverage";

const dir = mkdtempSync(path.join(tmpdir(), "coverage-"));
const NOW = Date.parse("2026-10-15T04:00:00Z");
const write = (name: string, body: string) => {
  const p = path.join(dir, name);
  writeFileSync(p, body);
  return p;
};
const status = (generated_at: string) =>
  JSON.stringify({ generated_at, overall: "PASS", rows: [{ id: "supabase-db", status: "PASS", detail: "ok" }] });

describe("readBackupCoverage", () => {
  it("reads a fresh status", async () => {
    const r = await readBackupCoverage(write("fresh.json", status("2026-10-15T03:30:05Z")), NOW);
    expect(r.state).toBe("ok");
  });

  it("an old PASS is stale, not ok", async () => {
    const r = await readBackupCoverage(write("old.json", status("2026-10-14T01:00:00Z")), NOW);
    expect(r.state).toBe("stale");
  });

  it("a missing file says the check has not run", async () => {
    const r = await readBackupCoverage(path.join(dir, "nope.json"), NOW);
    expect(r).toMatchObject({ state: "missing" });
  });

  it("broken JSON or a file without rows is unreadable", async () => {
    expect((await readBackupCoverage(write("bad.json", "{"), NOW)).state).toBe("unreadable");
    expect((await readBackupCoverage(write("norows.json", '{"generated_at":"2026-10-15T03:30:05Z"}'), NOW)).state).toBe("unreadable");
  });
});
