// @vitest-environment jsdom
// K15 期末閘（CLIENT-CONTEXT-PLAN-20261121 :244）：provider＋客戶欄整體走一次、其他測試沒涵蓋的三項。
// ① 只帶舊 ?siteId=（沒有 org）→ 查那一站、推出 org、網址成 ?org=&site=；③ 客戶帳號帶他人 ?org=／?site= → 從網址移除；
// ④ 員工在產品門（onDoor、沒有內部 id prop）用同一支 org-search 搜尋並換客戶。其餘各項的測試名見 K15 交回。
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientContextProvider } from "../../../app/ClientContextProvider";
import { ClientRail } from "../../../app/ClientRail";
import { useClientContext } from "../use-client-context";
import type { Layer } from "../contract";

vi.mock("@/lib/client-context/track-picked", () => ({ trackClientPicked: vi.fn() }));
const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/tools/content",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const INTERNAL = "99999999-9999-4999-8999-999999999999";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const org = (id: string, slug: string, name: string) => ({ id, slug, name, color: "var(--accent)", brandColors: [] });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/ops/org-search?q=")) return json({ ok: true, orgs: [org(B, "beta", "Beta")], total: 1 });
    if (url.startsWith("/api/ops/org-search")) return json({ ok: true, orgs: [org(A, "acme", "Acme"), org(INTERNAL, "aw", "AwareWave Ops")], total: 2, internalOrgId: INTERNAL });
    if (url.includes(`siteId=${S1}`)) return json({ ok: true, sites: [{ id: S1, name: "主站", organization_id: A }] });
    if (url.includes(`organizationId=${A}`)) return json({ ok: true, sites: [{ id: S1, name: "主站", organization_id: A }, { id: S2, name: "部落格", organization_id: A }] });
    return json({ ok: true, sites: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Page({ layer }: { layer: Layer }) {
  useClientContext(layer);
  return null;
}

function mount(layer: Layer, opts: { sessionOrg?: string | null; onDoor?: boolean; internalOrgId?: string | null } = {}) {
  return render(
    <ClientContextProvider sitesPath="/api/content/sites" sessionOrg={opts.sessionOrg ?? null} hostOrg={null}
      internalOrgId={opts.internalOrgId === undefined ? INTERNAL : opts.internalOrgId} hosts={{ staff: "https://app.example.test" }} onDoor={opts.onDoor ?? false}>
      <ClientRail />
      <Page layer={layer} />
    </ClientContextProvider>,
  );
}

describe("K15 ① an old ?siteId= link alone", () => {
  it("looks that site up, infers its client and ends on ?org=&site= with siteId gone", async () => {
    nav.search = `siteId=${S1}`;
    mount("site");
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith(`/tools/content?org=${A}&site=${S1}`));
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === `/api/content/sites?siteId=${S1}`)).toBe(true);
  });
});

describe("K15 ③ a client account given another client's ids", () => {
  it("org layer: the foreign ?org= is removed, nothing about it is looked up", async () => {
    nav.search = `org=${B}&view=grid`;
    mount("org", { sessionOrg: A });
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith("/tools/content?view=grid"));
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes(B))).toBe(false);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith("/api/ops/org-search"))).toBe(false);
  });

  it("site layer: a foreign ?org= and a site outside their own list are both removed, no reason shown", async () => {
    nav.search = `org=${B}&site=${SB}`;
    mount("site", { sessionOrg: A });
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith("/tools/content"));
    expect(screen.queryByText(/找不到|沒有權限|不屬於/)).toBeNull();
  });
});

describe("K15 ④ staff on a product door", () => {
  it("searches through the same /api/ops/org-search and switches client in the URL", async () => {
    nav.search = `org=${A}&site=${S1}&topic=t1`;
    mount("site", { onDoor: true, internalOrgId: null });
    fireEvent.change(await screen.findByLabelText("搜尋客戶"), { target: { value: "bet" } });
    fireEvent.click(await screen.findByRole("button", { name: "Beta" }));
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/ops/org-search?q=bet")).toBe(true);
    expect(nav.replace).toHaveBeenLastCalledWith(`/tools/content?org=${B}`);
  });
});
