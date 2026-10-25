/**
 * Invariant: a Trigger worker calls next-admin only on a server-to-server path (matcher-excluded
 * /api/internal/* or /api/webhooks/*), with its own token. It never has a browser session, so a
 * session-gated route (e.g. /api/tools/*) refuses it with 401 -- the tarot batch did exactly that.
 * Those paths skip the middleware, so their routes must not trust identity headers either.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "../../middleware";
import { createJob } from "../tarot/batch-store";
import { createFakeBatchDb } from "../tarot/__tests__/fake-batch-db";

const fakeDb = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => fakeDb.client }));
import { POST as start } from "../../app/api/internal/tarot/batch/[jobId]/start/route";
import { POST as card } from "../../app/api/internal/tarot/batch/[jobId]/card/route";

const WORKFLOWS_SRC = path.resolve(__dirname, "../../../../../../packages/workflows/src");
const MATCHER = new RegExp(`^${config.matcher[0]}$`);

/** Every `${base}/api/...` path fetched by a workflows file that targets next-admin (AWAREWAVE_WEBHOOK_BASE_URL). */
function nextAdminCallbackPaths(): { file: string; path: string }[] {
  const out: { file: string; path: string }[] = [];
  for (const rel of readdirSync(WORKFLOWS_SRC, { recursive: true }) as string[]) {
    if (!rel.endsWith(".ts") || rel.includes(".test.")) continue;
    const src = readFileSync(path.join(WORKFLOWS_SRC, rel), "utf8");
    if (!src.includes("AWAREWAVE_WEBHOOK_BASE_URL")) continue;
    for (const m of src.matchAll(/`\$\{base\}(\/api\/[^`?]*)/g)) out.push({ file: rel, path: m[1] });
  }
  return out;
}

describe("Trigger -> next-admin callbacks stay off the session gate", () => {
  it("the scan finds the callers (guards against a silently empty scan)", () => {
    // Named, not counted: a count only tracked how many tasks existed (10 until the timer tasks left Trigger,
    // handoffs/2026-10-25-schedules-off-trigger C2.3). These callers must be seen, or the scan is broken.
    const files = nextAdminCallbackPaths().map((c) => c.file.replace(/\\/g, "/"));
    expect(files).toEqual(expect.arrayContaining([
      "trigger/tarot-batch-generate.ts", "lib/collection/postResearchRunExecute.ts",
      "lib/tenant-provisioning/postTenantIntegrationWebhook.ts",
    ]));
  });

  it("every callback path is excluded by the middleware matcher", () => {
    const gated = nextAdminCallbackPaths()
      .filter((c) => MATCHER.test(c.path.replace(/\$\{[^}]+\}/g, "x")))
      .map((c) => `${c.file}: ${c.path}`);
    expect(gated).toEqual([]);
  });

  it("the old session-gated tarot paths were refused without a session (401) -- why the batch failed", async () => {
    const res = await middleware(new NextRequest("https://app.aware-wave.com/api/tools/tarot/batch/j/card", {
      method: "POST", headers: { host: "app.aware-wave.com", authorization: "Bearer s" },
    }));
    expect(res.status).toBe(401);
  });
});

describe("tarot batch callbacks: own token, never a role header", () => {
  const saved = process.env.BATCH_INTERNAL_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.BATCH_INTERNAL_SECRET;
    else process.env.BATCH_INTERNAL_SECRET = saved;
  });
  const call = (route: typeof start, jobId: string, headers: Record<string, string>) =>
    route(new Request(`http://next-admin/api/internal/tarot/batch/${jobId}/x`, { method: "POST", headers, body: "{}" }),
      { params: Promise.resolve({ jobId }) });

  it.each([["start", start], ["card", card]] as const)("%s: role header alone, wrong token, or unset secret -> 401", async (_n, route) => {
    process.env.BATCH_INTERNAL_SECRET = "batch-secret-for-test";
    expect((await call(route, "j", { "x-ops-claims-role": "owner" })).status).toBe(401);
    expect((await call(route, "j", { authorization: "Bearer wrong" })).status).toBe(401);
    delete process.env.BATCH_INTERNAL_SECRET;
    expect((await call(route, "j", { authorization: "Bearer " })).status).toBe(401);
  });

  it("start: the right token marks a known job running", async () => {
    process.env.BATCH_INTERNAL_SECRET = "batch-secret-for-test";
    fakeDb.client = createFakeBatchDb().client;
    const jobId = "00000000-0000-4000-8000-000000000001";
    await createJob({ jobId, organizationId: null, createdBy: null, actor: "ops:operator:u1", model: "flux-schnell", aspectRatio: "2:3", totalCards: 1 });
    expect((await call(start, jobId, { authorization: "Bearer batch-secret-for-test" })).status).toBe(200);
    expect((await call(start, "unknown", { authorization: "Bearer batch-secret-for-test" })).status).toBe(404);
  });
});
