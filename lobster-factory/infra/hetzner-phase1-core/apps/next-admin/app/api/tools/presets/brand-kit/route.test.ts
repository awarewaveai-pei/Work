// Card C6: a saved brand kit reads back the same, and a customer cannot read another organization's kit.
// ops-role and tenant-guard are the real ones; the organizations table is an in-memory map.
import { describe, expect, it, vi } from "vitest";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const db = vi.hoisted(() => ({ orgs: new Map<string, { name: string; metadata: Record<string, unknown> }>() }));

vi.mock("@/lib/supabase-server", () => {
  const client = {
    from: (table: string) => {
      let id = "";
      let patch: Record<string, unknown> | null = null;
      const row = () => {
        const o = db.orgs.get(id);
        if (!o) return null;
        const cc = (o.metadata.client_config ?? {}) as Record<string, unknown>;
        return { id, name: o.name, metadata: o.metadata, bannerKit: cc.bannerKit ?? null, brandColors: cc.brandColors ?? null, cis: cc.brandKit ?? null };
      };
      const q = {
        select: () => q,
        update: (p: Record<string, unknown>) => { patch = p; return q; },
        insert: async () => ({ error: null }),
        eq: (_c: string, v: string) => {
          id = v;
          if (patch && table === "organizations") {
            const o = db.orgs.get(id);
            if (o) o.metadata = patch.metadata as Record<string, unknown>;
            return Promise.resolve({ error: null });
          }
          return q;
        },
        maybeSingle: async () => ({ data: row(), error: null }),
      };
      return q;
    },
  };
  return { getSupabaseWriteClient: () => client, getSupabaseReadClient: () => client };
});
import { GET, PUT } from "./route";
import { getDesignsPublicBase } from "@/lib/storage/r2";

const admin = { "x-ops-user-kind": "staff", "x-ops-claims-role": "admin" };
const customer = { "x-ops-user-kind": "client", "x-ops-org-id": ORG };
const url = (q = "") => `https://design.aware-wave.com/api/tools/presets/brand-kit${q}`;
// the logo is in our designs bucket: another website's logo is dropped (the banner canvas could not read it)
const KIT = {
  name: "Acme", logo: `${getDesignsPublicBase()}/designs/acme.png`, colors: ["#112233", "#445566", "#ff8800", "#1a1a1a", "#ffffff"],
  headlineFont: "'Noto Serif TC', 'Songti TC', serif", bodyFont: "'Noto Sans TC', 'PingFang TC', sans-serif", headlineWeight: 800, bodyWeight: 400,
};

describe("banner brand kit", () => {
  it("staff save a kit for a client; the client reads back exactly that kit", async () => {
    db.orgs.set(ORG, { name: "Acme", metadata: { client_config: { brandColors: { primary: "#000000" }, ssh_host: "10.0.0.5" } } });
    const put = await PUT(new Request(url(), { method: "PUT", headers: { "content-type": "application/json", ...admin }, body: JSON.stringify({ orgId: ORG, kit: KIT }) }));
    expect(put.status).toBe(200);
    const res = await GET(new Request(url(), { headers: customer }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ saved: true, canEdit: false, kit: { ...KIT, orgId: ORG } });
    expect(JSON.stringify(j)).not.toContain("10.0.0.5");                                    // other client_config keys never leave
    expect((db.orgs.get(ORG)!.metadata.client_config as Record<string, unknown>).ssh_host).toBe("10.0.0.5"); // and are kept
  });

  it("a customer naming another organization gets 403 and none of its kit", async () => {
    db.orgs.set(OTHER, { name: "Other", metadata: { client_config: { bannerKit: { ...KIT, name: "Secret" } } } });
    const res = await GET(new Request(url(`?orgId=${OTHER}`), { headers: customer }));
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("Secret");
  });
});
