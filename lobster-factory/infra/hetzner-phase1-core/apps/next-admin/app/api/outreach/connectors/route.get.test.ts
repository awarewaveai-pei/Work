// GET lists what an organization actually runs on: its own connectors and the agency's (organization_id IS NULL), which
// generate.ts and mailbox-verify.ts fall back to. The agency rows carry no vault pointer, only whether a key is set.
import { describe, expect, it, vi } from "vitest";

const ORG = "39ad4149-5044-4077-8d9a-b6b916de0e21";
const rows = [
  { id: "a", organization_id: ORG, connector_name: "gmail", connector_type: "email_send", is_enabled: true, credentials_ref: "vault:a", settings: null },
  { id: "b", organization_id: null, connector_name: "hunter", connector_type: "email_verification", is_enabled: true, credentials_ref: "vault:b", settings: null },
];
function query() {
  let filtered = rows;
  const q = {
    select: () => q, order: () => q, limit: () => q,
    eq: (col: string, v: unknown) => { filtered = filtered.filter((r) => (r as Record<string, unknown>)[col] === v); return q; },
    is: (col: string, v: unknown) => { filtered = filtered.filter((r) => (r as Record<string, unknown>)[col] === v); return q; },
    then: (res: (x: { data: unknown; error: null }) => unknown) => res({ data: filtered, error: null }),
  };
  return q;
}
vi.mock("@/lib/org-client", () => ({ getOrgSupabaseWriteClient: async () => ({ from: () => query() }) }));
// a customer's database is found through its organization's slug (lib/outreach/db-client.ts outreachSlug)
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: null }, error: null }) }) }) }) }) }));

const { GET } = await import("./route");
const get = (qs: string) => GET(new Request(`http://app.test/api/outreach/connectors${qs}`, { headers: { "x-ops-user-kind": "staff" } }));

describe("GET /api/outreach/connectors", () => {
  it("with an organization: its own rows plus the agency's, the agency's without a vault pointer", async () => {
    const j = await (await get(`?organizationId=${ORG}`)).json();
    expect(j.connectors.map((c: { id: string }) => c.id)).toEqual(["a"]);
    expect(j.agency).toEqual([{ connector_name: "hunter", connector_type: "email_verification", is_enabled: true, has_key: true }]);
    expect(JSON.stringify(j.agency)).not.toContain("vault:");
    expect(j.builtin.map((b: { name: string }) => b.name)).toEqual(["openai", "serper", "google_oauth"]);
  });
  it("a customer gets neither the agency's rows nor the host's settings (Codex 2026-11-04)", async () => {
    const res = await GET(new Request(`http://app.test/api/outreach/connectors?organizationId=${ORG}`,
      { headers: { "x-ops-user-kind": "client", "x-ops-org-id": ORG } }));
    const j = await res.json();
    expect(j.agency).toEqual([]);
    expect(j.builtin).toEqual([]);
  });
  it("without an organization: every row is already listed, no separate agency list", async () => {
    const j = await (await get("")).json();
    expect(j.connectors).toHaveLength(2);
    expect(j.agency).toEqual([]);
  });
});
