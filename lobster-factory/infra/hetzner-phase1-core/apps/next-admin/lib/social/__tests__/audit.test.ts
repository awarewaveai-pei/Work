// C11: every action that is not a post state change still writes exactly one row to the brand's log (state changes
// and edits write theirs inside the 0098/0100/0101 functions, proven by the local-verify scripts).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; op: string; payload?: unknown };
const calls: Call[] = [];
// a chainable stand-in for supabase-js: every builder call returns itself; awaiting it answers by (table, op)
function fakeDb(answers: Record<string, unknown>) {
  return {
    from(table: string) {
      let op = "select";
      let payload: unknown;
      const b: Record<string, unknown> = {};
      const chain = () => b;
      for (const m of ["select", "eq", "is", "lt", "in", "order", "limit", "maybeSingle", "single"]) b[m] = chain;
      for (const m of ["insert", "update", "delete", "upsert"]) b[m] = (p?: unknown) => { op = m; payload = p; return b; };
      b.then = (resolve: (v: unknown) => void) => {
        calls.push({ table, op, payload });
        resolve({ data: answers[`${table}.${op}`] ?? null, error: null });
      };
      return b;
    },
    rpc: vi.fn(),
  };
}
let db = fakeDb({});
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => db }));
vi.mock("@/lib/content/postiz", async (orig) => ({
  ...(await orig<typeof import("@/lib/content/postiz")>()),
  listAllIntegrations: vi.fn(async () => []), connectUrl: vi.fn(async () => "https://oauth"), uploadMedia: vi.fn(async () => ({ id: "m", path: "https://p/m.jpg" })),
}));

import { addImage, cancelConnect, startConnect, unlinkAccount } from "../store";

const logRows = () => calls.filter((c) => c.table === "social_audit_log" && c.op === "insert").map((c) => (c.payload as { action: string; actor: string }));

beforeEach(() => { calls.length = 0; });

describe("one log row per action (C11)", () => {
  it("connect start, cancel, unlink, media upload", async () => {
    db = fakeDb({ "social_connect_attempts.insert": { id: "att" }, "social_connect_attempts.update": [{ id: "att", platform: "bluesky" }],
      "social_accounts.delete": [{ id: "acc", platform: "x", label: "@a" }], "social_media.insert": { id: "m1", kind: "image", file_name: "a.png" } });
    await startConnect("brand", "bluesky", null, "ops:operator");
    await cancelConnect("brand", "att", "ops:operator");
    await unlinkAccount("brand", "acc", "ops:owner");
    await addImage("brand", "https://x/a.png", "a.png", "ops:operator");
    expect(logRows().map((r) => [r.action, r.actor])).toEqual([
      ["connect_start", "ops:operator"], ["connect_cancel", "ops:operator"], ["unlink", "ops:owner"], ["media_upload", "ops:operator"],
    ]);
  });
});
