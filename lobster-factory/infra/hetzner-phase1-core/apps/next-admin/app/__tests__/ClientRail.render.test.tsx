// @vitest-environment jsdom
//
// 客戶欄（K4）：未登記不畫、未選、已選、搜尋、換客戶清掉依附參數、客戶帳號沒有客戶清單、site 層網站按鈕在清單下方。
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientContextProvider } from "../ClientContextProvider";
import { ClientRail } from "../ClientRail";
import { useClientContext } from "@/lib/client-context/use-client-context";
import type { Layer } from "@/lib/client-context/contract";

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

const org = (id: string, slug: string, name: string) => ({ id, slug, name, color: "var(--accent)", brandColors: [] });
const ORGS = [org(A, "acme", "Acme"), org(B, "beta", "Beta"), org(INTERNAL, "aw-ops", "AwareWave Ops")];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/ops/org-search?q=")) return json({ ok: true, orgs: [org(B, "beta", "Beta")], total: 1 });
    if (url.startsWith("/api/ops/org-search")) return json({ ok: true, orgs: ORGS, total: 120 });
    if (url.includes("organizationId=")) {
      return json({ ok: true, sites: [{ id: S1, name: "主站", organization_id: A }, { id: S2, name: "部落格", organization_id: A }] });
    }
    return json({ ok: true, sites: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Page({ layer }: { layer: Layer }) {
  useClientContext(layer);
  return null;
}

function mount(opts: { layer?: Layer; sessionOrg?: string | null } = {}) {
  return render(
    <ClientContextProvider sessionOrg={opts.sessionOrg ?? null} hostOrg={null} internalOrgId={INTERNAL} hosts={{}} onDoor={false}>
      <ClientRail />
      {opts.layer && <Page layer={opts.layer} />}
    </ClientContextProvider>,
  );
}

describe("ClientRail", () => {
  it("no page registered -> no rail, no fetch", () => {
    mount();
    expect(screen.queryByRole("complementary", { name: "客戶欄" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("staff, nothing picked -> 請先選客戶, list with AwareWave 自己 and no internal duplicate", async () => {
    mount({ layer: "org" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Acme" })).toBeTruthy());
    expect(screen.getByText("請先選客戶")).toBeTruthy();
    expect(screen.getByRole("button", { name: "AwareWave 自己" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AwareWave Ops" })).toBeNull();
    expect(screen.queryByRole("button", { pressed: true })).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/ops/org-search");
  });

  it("staff, org in URL -> that row pressed, include asked, client page link", async () => {
    nav.search = `org=${A}`;
    mount({ layer: "org" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Acme" }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.queryByText("請先選客戶")).toBeNull();
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === `/api/ops/org-search?include=${A}`)).toBe(true);
    expect(screen.getByRole("link", { name: "客戶頁 →" }).getAttribute("href")).toBe("/ops/clients/acme");
  });

  it("search goes to the same org-search route", async () => {
    mount({ layer: "org" });
    fireEvent.change(await screen.findByLabelText("搜尋客戶"), { target: { value: "bet" } });
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/ops/org-search?q=bet")).toBe(true));
  });

  it("switching client clears site, topic, month (and legacy siteId), keeps the rest", async () => {
    nav.search = `org=${A}&site=${S1}&topic=t1&month=2026-11&view=grid`;
    mount({ layer: "org" });
    fireEvent.click(await screen.findByRole("button", { name: "Beta" }));
    const last = String(nav.replace.mock.calls.at(-1)?.[0]);
    const sp = new URLSearchParams(last.split("?")[1]);
    expect(last.startsWith("/tools/content?")).toBe(true);
    expect(sp.get("org")).toBe(B);
    expect(sp.get("view")).toBe("grid");
    for (const k of ["site", "topic", "month", "siteId"]) expect(sp.has(k)).toBe(false);
  });

  it("picking AwareWave 自己 writes the internal id, never an empty org", async () => {
    mount({ layer: "org" });
    fireEvent.click(await screen.findByRole("button", { name: "AwareWave 自己" }));
    expect(String(nav.replace.mock.calls.at(-1)?.[0])).toBe(`/tools/content?org=${INTERNAL}`);
  });

  it("client account, org layer -> no rail and no client list fetch", () => {
    mount({ layer: "org", sessionOrg: A });
    expect(screen.queryByRole("complementary", { name: "客戶欄" })).toBeNull();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith("/api/ops/org-search"))).toBe(false);
  });

  it("client account, site layer -> own site buttons only, no client list", async () => {
    mount({ layer: "site", sessionOrg: A });
    await waitFor(() => expect(screen.getByRole("button", { name: "部落格" })).toBeTruthy());
    expect(screen.queryByLabelText("搜尋客戶")).toBeNull();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith("/api/ops/org-search"))).toBe(false);
  });

  it("staff, site layer -> site buttons sit below the client list", async () => {
    nav.search = `org=${A}`;
    mount({ layer: "site" });
    const siteBtn = await screen.findByRole("button", { name: "主站" });
    const clientBtn = await screen.findByRole("button", { name: "Acme" });
    expect(clientBtn.compareDocumentPosition(siteBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(siteBtn);
    expect(String(nav.replace.mock.calls.at(-1)?.[0])).toBe(`/tools/content?org=${A}&site=${S1}`);
  });
});
