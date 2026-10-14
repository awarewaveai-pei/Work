// /ops/backup renders what the host check wrote: problems first, a stale or missing status never reads as healthy.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "backups-page-"));

async function render(body: string | null) {
  const file = path.join(dir, `${Math.random()}.json`);
  if (body !== null) writeFileSync(file, body);
  vi.stubEnv("BACKUP_COVERAGE_STATUS_FILE", file);
  vi.resetModules();
  const { default: BackupsPage } = await import("../page");
  return renderToStaticMarkup(await BackupsPage());
}

afterEach(() => vi.unstubAllEnvs());

const now = new Date().toISOString();

describe("/ops/backup", () => {
  it("lists the failing store first with its card", async () => {
    const html = await render(JSON.stringify({ generated_at: now, overall: "FAIL", rows: [
      { id: "supabase-db", status: "PASS", detail: "ok" },
      { id: "chatwoot", status: "FAIL", detail: "chatwoot.sql.gz missing", plan: "B4" },
    ] }));
    expect(html).toContain("2 項裡有 1 項有問題");
    expect(html.indexOf("chatwoot")).toBeLessThan(html.indexOf("supabase-db"));
    expect(html).toContain("B4");
  });

  it("all PASS says so", async () => {
    const html = await render(JSON.stringify({ generated_at: now, overall: "PASS", rows: [{ id: "n8n", status: "PASS", detail: "ok" }] }));
    expect(html).toContain("1 項全部正常");
  });

  it("an old status is called out, not shown as healthy", async () => {
    const html = await render(JSON.stringify({ generated_at: "2020-01-01T00:00:00Z", overall: "PASS", rows: [{ id: "n8n", status: "PASS", detail: "ok" }] }));
    expect(html).toContain("檢查可能停了");
    expect(html).not.toContain("全部正常");
  });

  it("no status file says the check has not run", async () => {
    expect(await render(null)).toContain("讀不到檢查結果");
  });
});
