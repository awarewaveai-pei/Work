// The recipient cap (0152 co_begin_send: 2 mails per recipient in 30 days) keys a free-mail address by the whole address,
// any other by its domain -- else every Gmail recipient would share two mails. The free-mail list lives twice: in SQL
// (co_recipient_cap_key) and here (research-extract.ts FREE_MAIL). Invariant: the LATEST migration defining the
// function lists exactly FREE_MAIL, so adding a provider on one side alone fails here.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREE_MAIL } from "../research-extract";

// __tests__ -> outreach -> lib -> next-admin -> apps -> hetzner-phase1-core -> infra -> lobster-factory.
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../../../packages/db/migrations");

function latestSqlList(): { file: string; values: string[] } {
  const found = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort()
    .flatMap((file) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(/--[^\n]*/g, "");
      const fn = /function\s+public\.co_recipient_cap_key[\s\S]*?\$\$([\s\S]*?)\$\$/i.exec(sql);
      const arr = fn && /array\s*\[([^\]]*)\]/i.exec(fn[1]);
      return arr ? [{ file, values: [...arr[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) }] : [];
    });
  expect(found.length).toBeGreaterThan(0);
  return found[found.length - 1];
}

describe("free-mail list: SQL recipient key = FREE_MAIL", () => {
  it("the latest co_recipient_cap_key lists exactly FREE_MAIL", () => {
    const { file, values } = latestSqlList();
    expect([...values].sort(), file).toEqual([...FREE_MAIL].sort());
  });
});
