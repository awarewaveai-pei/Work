// @vitest-environment jsdom
//
// K7: the content studio's site comes only from the client rail (ADR 020: URL org/site, ClientContextProvider).
// Mounts the real page inside the real provider + rail, so the wiring is proven, not just contract.ts's decide().
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { ClientContextProvider } from "@/app/ClientContextProvider";
import { ClientRail } from "@/app/ClientRail";
import ContentStudio from "../ContentStudio";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/tools/content",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const A = "11111111-1111-4111-8111-111111111111";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function site(id: string, name: string): ManagedSite {
  return {
    id, name, url: `https://${id.slice(0, 4)}.example.com`, color: "var(--accent)",
    active: true, tokenSet: true, usernameSet: true, note: null, source: "db", organization_id: A,
  };
}
const SITE_1 = site(S1, "主站");
const SITE_2 = site(S2, "部落格");

let fetchMock: ReturnType<typeof vi.fn>;
function mockFetch(sites: ManagedSite[]) {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (url.startsWith("/api/ops/org-search")) return ok({ ok: true, orgs: [], total: 0 });
    if (url.startsWith("/api/content/sites?siteId=")) {
      const id = new URLSearchParams(url.split("?")[1]).get("siteId");
      return ok({ ok: true, sites: sites.filter((s) => s.id === id) });
    }
    if (url.startsWith("/api/content/sites")) return ok({ ok: true, sites });
    return ok({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
}
const called = (prefix: string) => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith(prefix));

function page(sessionOrg: string | null = null) {
  return (
    <ClientContextProvider sitesPath="/api/content/sites" sessionOrg={sessionOrg} hostOrg={null} internalOrgId={null} hosts={{}} onDoor={Boolean(sessionOrg)}>
      <ClientRail />
      <ContentStudio />
    </ClientContextProvider>
  );
}

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ContentStudio -- site from the client rail (K7)", () => {
  it("has no site dropdown: no <option> on the page names a site", async () => {
    nav.search = `org=${A}`;
    mockFetch([SITE_1, SITE_2]);
    render(page());
    await screen.findByRole("button", { name: "部落格" });   // the rail's site buttons
    const optionTexts = Array.from(document.querySelectorAll("option")).map((o) => o.textContent);
    expect(optionTexts).not.toContain("主站");
    expect(optionTexts).not.toContain("部落格");
  });

  it("shows the URL's site and follows a same-route URL change without remount", async () => {
    nav.search = `org=${A}&site=${S1}`;
    mockFetch([SITE_1, SITE_2]);
    const { rerender } = render(page());
    await waitFor(() => expect(called(`/api/content/categories?siteId=${S1}`)).toHaveLength(1));
    expect(screen.getByText(SITE_1.url + " ↗")).toBeTruthy();
    nav.search = `org=${A}&site=${S2}`;
    rerender(page());
    await waitFor(() => expect(screen.getByText(SITE_2.url + " ↗")).toBeTruthy());
    expect(called(`/api/content/tags?siteId=${S2}`)).toHaveLength(1);
  });

  it("no site picked: no patterns/categories/tags call, and 'save as client default' is disabled", async () => {
    nav.search = `org=${A}`;
    mockFetch([SITE_1, SITE_2]);
    render(page());
    await screen.findByText("請在客戶欄選網站。");
    expect(called("/api/content/patterns")).toHaveLength(0);
    expect(called("/api/content/categories")).toHaveLength(0);
    expect(called("/api/content/tags")).toHaveLength(0);
    expect((screen.getByRole("button", { name: "💾 存為客戶預設" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("no client picked: says so, and never falls back to a site", async () => {
    mockFetch([SITE_1, SITE_2]);
    render(page());
    await screen.findByText("請先在客戶欄選客戶。");
    expect(called("/api/content/sites")).toHaveLength(0);
    expect(called("/api/content/categories")).toHaveLength(0);
  });

  it("an old ?siteId= link becomes ?org=&site=", async () => {
    nav.search = `siteId=${S1}`;
    mockFetch([SITE_1, SITE_2]);
    render(page());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/tools/content?org=${A}&site=${S1}`));
  });

  it("customer account on the content door: only its own sites, no client list; its only site is picked", async () => {
    mockFetch([SITE_1]);
    render(page(A));
    await waitFor(() => expect(screen.getByText(SITE_1.url + " ↗")).toBeTruthy());
    expect(called("/api/content/sites")).toEqual([`/api/content/sites?organizationId=${A}`]);
    expect(called("/api/ops/org-search")).toHaveLength(0);
    expect(screen.queryByText("請先選客戶")).toBeNull();
  });
});
