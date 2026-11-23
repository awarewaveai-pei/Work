// @vitest-environment jsdom
//
// U11: 草稿「開啟」 goes to the 寫文章 page with ?draft=<id>. A draft of another client / site must not load there (saving would
// move the row to this site, publishing would push it to this site's WordPress), and ?draft is dropped once handled.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { ClientContextProvider } from "@/app/ClientContextProvider";
import ContentStudio from "../ContentStudio";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  usePathname: () => "/tools/content",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SITE: ManagedSite = {
  id: S1, name: "主站", url: "https://aaaa.example.com", color: "var(--accent)",
  active: true, tokenSet: true, usernameSet: true, note: null, source: "db", organization_id: A,
};

function mockFetch(draftOrg: string, draftSite: string) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (url.startsWith("/api/content/sites")) return ok({ ok: true, sites: [SITE] });
    if (url.startsWith(`/api/content/drafts?id=${D}`)) {
      return ok({ ok: true, draft: { id: D, markdown: "# 舊稿內文", meta: null, slugHint: null, formSnapshot: null, keyword: "舊稿", organizationId: draftOrg, siteId: draftSite } });
    }
    return ok({ ok: true });
  }));
}

const page = () => (
  <ClientContextProvider sitesPath="/api/content/sites" sessionOrg={null} hostOrg={null} internalOrgId={null} hosts={{}} onDoor={false}>
    <ContentStudio view="generate" heading={<h1>寫文章</h1>} />
  </ClientContextProvider>
);

beforeEach(() => { nav.search = `org=${A}&site=${S1}&draft=${D}`; nav.replace.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("寫文章 ?draft=<id> (U11)", () => {
  it("refuses a draft of another client, says so, and drops ?draft from the address", async () => {
    mockFetch(B, S1);
    render(page());
    expect(await screen.findByText(/這篇草稿屬於另一個客戶或網站/)).toBeTruthy();
    expect(screen.queryByText("產出文章")).toBeNull();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(expect.not.stringContaining("draft=")));
  });

  it("loads a draft of the picked client and site into the editor", async () => {
    mockFetch(A, S1);
    render(page());
    expect(await screen.findByText("產出文章")).toBeTruthy();
    expect(screen.queryByText(/這篇草稿屬於另一個客戶或網站/)).toBeNull();
    expect(nav.replace).toHaveBeenCalledWith(expect.not.stringContaining("draft="));
  });
});
