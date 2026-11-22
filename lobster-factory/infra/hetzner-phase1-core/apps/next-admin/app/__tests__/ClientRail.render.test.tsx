// @vitest-environment jsdom
//
// 客戶欄（K4）：未登記不畫、未選、已選、搜尋、換客戶清掉依附參數、客戶帳號沒有客戶清單、site 層網站按鈕在清單下方。
// U3：類別按鈕（單選、看得見、伺服器篩）、標籤、產品門上由回應的 internalOrgId 畫「AwareWave 自己」。
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
const CATEGORIES = [
  { key: "all", label: "全部" }, { key: "attention", label: "需處理" }, { key: "contract", label: "訂閱" },
  { key: "credits", label: "點數" }, { key: "test", label: "測試" },
];

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
    if (url.startsWith("/api/ops/org-search")) return json({ ok: true, orgs: ORGS, total: 120, categories: CATEGORIES, internalOrgId: INTERNAL });
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

function mount(opts: { layer?: Layer; sessionOrg?: string | null; onDoor?: boolean; hosts?: Record<string, string>; internalOrgId?: string | null } = {}) {
  return render(
    <ClientContextProvider sitesPath="/api/content/sites" sessionOrg={opts.sessionOrg ?? null} hostOrg={null} internalOrgId={opts.internalOrgId === undefined ? INTERNAL : opts.internalOrgId} hosts={opts.hosts ?? {}} onDoor={opts.onDoor ?? false}>
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
    expect(screen.getByRole("group", { name: "客戶" }).querySelector("[aria-pressed=true]")).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/ops/org-search?category=all");
  });

  it("staff, org in URL -> that row pressed, include asked, client page link", async () => {
    nav.search = `org=${A}`;
    mount({ layer: "org" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Acme" }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.queryByText("請先選客戶")).toBeNull();
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === `/api/ops/org-search?category=all&include=${A}`)).toBe(true);
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

  it("on a product door the client page link opens on the staff host", async () => {
    nav.search = `org=${A}`;
    mount({ layer: "org", onDoor: true, hosts: { staff: "https://app.example.test" } });
    const link = await screen.findByRole("link", { name: "客戶頁 →" });
    expect(link.getAttribute("href")).toBe("https://app.example.test/ops/clients/acme");
  });

  it("a failed sites read says so, not 'no sites'", async () => {
    nav.search = `org=${A}`;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/ops/org-search") ? json({ ok: true, orgs: ORGS, total: 3 }) : json({ ok: false }, 500));
    mount({ layer: "site" });
    await waitFor(() => expect(screen.getByText("網站載入失敗，請重新整理。")).toBeTruthy());
    expect(screen.queryByText("這個客戶還沒有網站。")).toBeNull();
  });

  it("a site-only URL whose lookup fails on the network says the read failed, not 'not found', and leaves the URL alone", async () => {
    nav.search = `site=${S1}`;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/ops/org-search")) return json({ ok: true, orgs: ORGS, total: 3 });
      throw new TypeError("Failed to fetch");
    });
    mount({ layer: "site" });
    await waitFor(() => expect(screen.getByText("網站載入失敗，請重新整理。")).toBeTruthy());
    expect(screen.queryByText("找不到網址指定的網站。")).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("category buttons: visible, single choice, 全部 first; a click asks the server for that category and keeps 自己 to 全部", async () => {
    mount({ layer: "org" });
    const group = await screen.findByRole("group", { name: "類別" });
    const buttons = [...group.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["全部", "需處理", "訂閱", "點數", "測試"]);
    expect(buttons.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent)).toEqual(["全部"]);
    expect(document.querySelector("select")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "測試" }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/ops/org-search?category=test")).toBe(true));
    expect(screen.getByRole("button", { name: "測試" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "全部" }).getAttribute("aria-pressed")).toBe("false");
    await waitFor(() => expect(screen.queryByRole("button", { name: "AwareWave 自己" })).toBeNull());
  });

  it("a row shows its tags in words; the dot stays the row's colour", async () => {
    fetchMock.mockImplementation(async () => json({
      ok: true, total: 1, categories: CATEGORIES, internalOrgId: INTERNAL,
      orgs: [{ ...org(A, "acme", "Acme"), color: "var(--text-muted)", tags: ["attention", "credits"] }],
    }));
    mount({ layer: "org" });
    const row = await screen.findByRole("button", { name: /Acme/ });
    expect(row.textContent).toContain("需處理・點數");
    expect((row.querySelector("span[aria-hidden]") as HTMLElement).style.background).toBe("var(--text-muted)");
  });

  it("on a door (no internal id prop) AwareWave 自己 comes from the answer", async () => {
    mount({ layer: "org", onDoor: true, internalOrgId: null });
    fireEvent.click(await screen.findByRole("button", { name: "AwareWave 自己" }));
    expect(String(nav.replace.mock.calls.at(-1)?.[0])).toBe(`/tools/content?org=${INTERNAL}`);
  });

  it("100 clients: one category click shows a client the first page does not", async () => {
    const many = Array.from({ length: 100 }, (_, i) => org(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `c${i}`, `Client ${i}`));
    const target = org("77777777-7777-4777-8777-777777777777", "late", "Late Payer");
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const cat = new URLSearchParams(String(input).split("?")[1]).get("category");
      return cat === "attention"
        ? json({ ok: true, orgs: [{ ...target, tags: ["attention"] }], total: 1, categories: CATEGORIES, internalOrgId: INTERNAL })
        : json({ ok: true, orgs: many.slice(0, 50), total: 100, categories: CATEGORIES, internalOrgId: INTERNAL });
    });
    mount({ layer: "org" });
    await screen.findByRole("button", { name: "Client 0" });
    expect(screen.queryByRole("button", { name: /Late Payer/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "需處理" }));
    expect(await screen.findByRole("button", { name: /Late Payer/ })).toBeTruthy();
  });

  it("says when AwareWave 自己 could not be read, and when tags do not cover every client", async () => {
    fetchMock.mockImplementation(async () => json({
      ok: true, orgs: ORGS.slice(0, 2), total: 2, categories: CATEGORIES, internalOrgId: null, internalOrgFailed: true, tagsPartial: true,
    }));
    mount({ layer: "org", onDoor: true, internalOrgId: null });
    expect((await screen.findByRole("alert")).textContent).toBe("AwareWave 自己 載入失敗");
    expect(screen.getByText(/超過的客戶沒有標籤/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AwareWave 自己" })).toBeNull();
  });
});
