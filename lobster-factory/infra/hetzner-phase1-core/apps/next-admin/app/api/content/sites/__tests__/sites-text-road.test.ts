// K7: a site's text road (textChain / textApiModel / textClaudeModel) is set by its own PATCH fields -- the API model a
// catalogue id only, a subscription only by the owner -- and 「套用到所有網站」 copies those three fields, nothing else,
// onto the other active sites of the SAME organization. The table below is a small in-memory wp_sites that applies the
// route's filters, so "another organization's site is untouched" is the route's own query doing it.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; name: string; url: string; organization_id: string | null; active: boolean; content_defaults: Record<string, unknown> | null };
const ORG = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222", OWNER = "u-owner";
const db = vi.hoisted(() => ({ rows: [] as Row[], orgs: [] as Array<{ id: string; metadata: Record<string, unknown> | null }>, audit: [] as unknown[], beforeUpdate: null as null | (() => void) }));
vi.mock("@/lib/supabase-server", () => {
  const jsonField = (r: Row, path: string) => {
    const v = (r.content_defaults ?? {})[path.replace("content_defaults->>", "")];
    return v === undefined || v === null ? null : typeof v === "string" ? v : JSON.stringify(v);
  };
  const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
  const query = (table: string) => {
    const tests: Array<(r: Row) => boolean> = [];
    const all = () => (table === "organizations" ? db.orgs : db.rows) as Row[];
    let patch: Record<string, unknown> | null = null;
    const hit = () => all().filter((r) => tests.every((t) => t(r)));
    const run = () => {
      if (patch && db.beforeUpdate) { const f = db.beforeUpdate; db.beforeUpdate = null; f(); }
      const rows = hit();
      if (patch) for (const r of rows) Object.assign(r, structuredClone(patch));
      return rows.map((r) => ({ ...r, token: "x", username: "u", color: "#000", note: null, created_at: "t" }));
    };
    const q = {
      select: () => q,
      update: (p: Record<string, unknown>) => { patch = p; return q; },
      // the jsonb column itself compares as values (key order ignored), as Postgres does for `content_defaults = '<json>'`
      eq: (c: string, v: unknown) => { tests.push((r) => c === "content_defaults" ? canon(r.content_defaults) === canon(JSON.parse(String(v)))
        : (c.startsWith("content_defaults->>") ? jsonField(r, c) : (r as Record<string, unknown>)[c]) === v); return q; },
      neq: (c: string, v: unknown) => { tests.push((r) => (r as Record<string, unknown>)[c] !== v); return q; },
      is: (c: string, v: null) => { tests.push((r) => (c === "content_defaults" ? r.content_defaults : jsonField(r, c)) === v); return q; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => { const d = run(); return d.length === 1 ? { data: d[0], error: null } : { data: null, error: { code: "PGRST116", message: "0 rows" } }; },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(ok, ko),
    };
    return q;
  };
  return { getSupabaseWriteClient: () => ({ from: (table: string) => table === "ops_audit_events"
    ? { insert: async (r: unknown) => { db.audit.push(r); return { error: null }; } } : query(table) }) };
});
// ORG = the operator's own organization (resolves to the internal root); OTHER = a customer
vi.mock("@/lib/entitlements/subject", async (orig) => ({
  ...(await orig<typeof import("@/lib/entitlements/subject")>()),
  resolveSubject: async (h: { orgId?: string }) => ({ orgId: h.orgId, kind: h.orgId === "11111111-1111-4111-8111-111111111111" ? "internal" : "customer" }),
}));
import { PATCH } from "../[id]/route";
import { POST as APPLY } from "../[id]/apply-text-road/route";
import { SUB_OWN_SITES_ONLY } from "@/lib/content/text-road-guard";
import { PATCH as MARK } from "../owner-subscription/route";

const owner = { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": OWNER };
const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator", "x-ops-user-id": "u-staff" };
const call = (fn: typeof PATCH, id: string, h: Record<string, string>, b?: object) => fn(new Request(`https://app.aware-wave.com/api/content/sites/${id}`, {
  method: b ? "PATCH" : "POST", headers: { "content-type": "application/json", ...h }, ...(b ? { body: JSON.stringify(b) } : {}),
}), { params: Promise.resolve({ id }) });
const row = (id: string) => db.rows.find((r) => r.id === id)!;

beforeEach(() => {
  vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", OWNER);
  db.beforeUpdate = null;
  db.orgs = [{ id: ORG, metadata: null }, { id: OTHER, metadata: { client_config: { audioExternalAiAllowed: false } } }];
  db.audit = [];
  db.rows = [
    { id: "a", name: "A", url: "https://a.example.com", organization_id: ORG, active: true, content_defaults: { tone: "Warm" } },
    { id: "b", name: "B", url: "https://b.example.com", organization_id: ORG, active: true, content_defaults: { tone: "Bold", publishMode: "ai_review_auto", textApiModel: "gpt-5.4" } },
    { id: "c", name: "C", url: "https://c.example.com", organization_id: ORG, active: false, content_defaults: { tone: "Calm" } },
    { id: "x", name: "X", url: "https://x.example.com", organization_id: OTHER, active: true, content_defaults: { tone: "Other" } },
  ];
});

describe("PATCH text road", () => {
  it("a subscription id as the API model is refused and nothing is written", async () => {
    const res = await call(PATCH, "a", owner, { textApiModel: "sub-codex-sol" });
    expect(res.status).toBe(400);
    expect(row("a").content_defaults).toEqual({ tone: "Warm" });
  });

  it("only the owner may put a subscription on the road; staff may go back to API only and pick the API model", async () => {
    expect((await call(PATCH, "a", staff, { textChain: "codex+api" })).status).toBe(403);
    expect((await call(PATCH, "a", staff, { textClaudeModel: "sub-claude-haiku" })).status).toBe(403);
    expect(row("a").content_defaults).toEqual({ tone: "Warm" });
    expect((await call(PATCH, "a", owner, { textChain: "claude+api", textClaudeModel: "sub-claude-haiku" })).status).toBe(200);
    expect((await call(PATCH, "a", staff, { textApiModel: "gpt-5.5" })).status).toBe(200);
    expect(row("a").content_defaults).toEqual({ tone: "Warm", textChain: "claude+api", textClaudeModel: "sub-claude-haiku", textApiModel: "gpt-5.5" });
    expect((await call(PATCH, "a", staff, { textChain: "api" })).status).toBe(200);
    expect(row("a").content_defaults?.textChain).toBe("api");
  });

  it("textCodexModel: a codex id is saved, anything else is 400, and a non-owner is refused (K17)", async () => {
    expect((await call(PATCH, "a", staff, { textCodexModel: "sub-codex-sol" })).status).toBe(403);
    expect((await call(PATCH, "a", owner, { textCodexModel: "sub-claude-haiku" })).status).toBe(400);   // a claude id is no codex model
    expect((await call(PATCH, "a", owner, { textCodexModel: "sub-codex" })).status).toBe(400);          // the pre-picker id is gone
    expect(row("a").content_defaults).toEqual({ tone: "Warm" });
    expect((await call(PATCH, "a", owner, { textChain: "codex+api", textCodexModel: "sub-codex-astra" })).status).toBe(200);
    expect(row("a").content_defaults).toEqual({ tone: "Warm", textChain: "codex+api", textCodexModel: "sub-codex-astra" });
    const res = await call(PATCH, "x", owner, { textCodexModel: "sub-codex-sol" });   // a customer's site, even from the owner
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(SUB_OWN_SITES_ONLY);
  });

  it("a whole-defaults save from a stale page keeps the stored road", async () => {
    await call(PATCH, "a", owner, { textChain: "codex+api" });
    expect((await call(PATCH, "a", owner, { contentDefaults: { tone: "New", textChain: "api" } })).status).toBe(200);
    expect(row("a").content_defaults).toEqual({ tone: "New", textChain: "codex+api" });
  });

  it("a customer's site cannot get a subscription road, not even from the owner; API only stays allowed", async () => {
    const res = await call(PATCH, "x", owner, { textChain: "codex+api" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(SUB_OWN_SITES_ONLY);
    expect((await call(PATCH, "x", owner, { textChain: "api", textApiModel: "gpt-5.5" })).status).toBe(200);
    expect(row("x").content_defaults).toEqual({ tone: "Other", textChain: "api", textApiModel: "gpt-5.5" });
  });
});

describe("the owner's mark on a client organization (operator 2026-11-22: 「Soulful 也是我的」)", () => {
  const mark = (h: Record<string, string>, allowed: boolean) => MARK(new Request("https://app.aware-wave.com/api/content/sites/owner-subscription", {
    method: "PATCH", headers: { "content-type": "application/json", ...h }, body: JSON.stringify({ organizationId: OTHER, allowed }),
  }));

  it("unmarked: no subscription road; marked by the owner: allowed; unmarked again: refused again", async () => {
    expect((await call(PATCH, "x", owner, { textChain: "codex+api" })).status).toBe(403);
    expect((await mark(owner, true)).status).toBe(200);
    expect(db.orgs.find((o) => o.id === OTHER)!.metadata).toEqual({ client_config: { audioExternalAiAllowed: false, ownerSubscription: true } });
    expect(db.audit).toHaveLength(1);
    expect((await call(PATCH, "x", owner, { textChain: "codex+api" })).status).toBe(200);
    expect((await mark(owner, false)).status).toBe(200);
    expect((await call(PATCH, "x", owner, { textChain: "claude+api" })).status).toBe(403);
  });

  it("anyone but the owner is refused and nothing is written", async () => {
    const res = await mark(staff, true);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("sub_operator_only");
    expect(db.orgs.find((o) => o.id === OTHER)!.metadata).toEqual({ client_config: { audioExternalAiAllowed: false } });
    expect(db.audit).toEqual([]);
  });
});

describe("apply the road to every site", () => {
  it("writes only the four road fields onto the organization's other active sites; another organization's site is untouched", async () => {
    await call(PATCH, "a", owner, { textChain: "claude+codex+api", textClaudeModel: "sub-claude-sonnet", textCodexModel: "sub-codex-luna" });
    const before = structuredClone(db.rows);
    const res = await call(APPLY, "a", owner);
    expect(await res.json()).toEqual({ ok: true, updated: ["B"], conflicts: [] });
    // B: the road copied (its own textApiModel dropped: A has none), every other setting as it was
    expect(row("b").content_defaults).toEqual({ tone: "Bold", publishMode: "ai_review_auto", textChain: "claude+codex+api", textClaudeModel: "sub-claude-sonnet", textCodexModel: "sub-codex-luna" });
    expect(row("c")).toEqual(before.find((r) => r.id === "c"));   // inactive
    expect(row("x")).toEqual(before.find((r) => r.id === "x"));   // another organization
    expect(row("a")).toEqual(before.find((r) => r.id === "a"));
  });

  it("a site changed between the read and the write is reported, and its newer setting is never written back", async () => {
    await call(PATCH, "a", owner, { textChain: "codex+api" });
    db.beforeUpdate = () => { row("b").content_defaults = { ...row("b").content_defaults, publishMode: "human_review" }; };
    expect(await (await call(APPLY, "a", owner)).json()).toEqual({ ok: true, updated: [], conflicts: ["B"] });
    expect(row("b").content_defaults).toEqual({ tone: "Bold", publishMode: "human_review", textApiModel: "gpt-5.4" });
  });

  it("a subscription road is copied only by the owner; a customer cannot call it at all", async () => {
    await call(PATCH, "a", owner, { textChain: "codex+api" });
    expect((await call(APPLY, "a", staff)).status).toBe(403);
    expect((await call(APPLY, "a", { "x-ops-user-kind": "client", "x-ops-org-id": ORG, "x-ops-claims-role": "operator" })).status).toBe(403);
    expect(row("b").content_defaults?.textChain).toBeUndefined();
  });
});
