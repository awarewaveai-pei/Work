// The knowledge overview rendered against the REAL database.
//
// /ops/* is behind the session middleware, so a dev server returns a redirect to /login and proves
// nothing about the page. A server component is just an async function returning JSX, so it can be
// invoked directly — which exercises the actual queries (columns, joins, counts) rather than a
// mock that would agree with whatever the code happens to ask for.
//
// OFF by default because it reads production: COLLECT_OPS_PAGE_LIVE=1 npx vitest run <this file>
// Read-only. It writes nothing and needs only the Supabase service key from .env.local.

import path from "node:path";
import { config as loadEnvFile } from "dotenv";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

loadEnvFile({ path: path.resolve(__dirname, "../../../../../.env.local"), override: false });

const LIVE = process.env.COLLECT_OPS_PAGE_LIVE === "1";

describe.skipIf(!LIVE)("/ops/knowledge against the real database", () => {
  it("renders the real knowledge base without throwing", async () => {
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY, ".env.local was not loaded").toBeTruthy();

    const { default: KnowledgeOverview } = await import("../page");
    const html = renderToStaticMarkup(await KnowledgeOverview());

    // The page loaded data rather than falling into its "cannot read the database" branch — that
    // branch is the one a wrong column name produces, and it renders perfectly happily.
    expect(html).not.toContain("讀不到資料庫");
    expect(html).toContain("知識庫");
    expect(html).toContain("現行文件");
    expect(html).toContain("外部原文引用"); // the provenance column exists and was read

    // A number was actually rendered for the document count, not a dash.
    const count = /現行文件<\/div><div[^>]*>(\d+)</.exec(html);
    expect(count, "no document count rendered").toBeTruthy();
    console.log(`\n/ops/knowledge 現行文件 = ${count![1]}`);
  }, 60_000);
});
