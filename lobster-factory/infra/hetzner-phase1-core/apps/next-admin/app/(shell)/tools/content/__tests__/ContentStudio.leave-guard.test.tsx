// @vitest-environment jsdom
//
// U11 leave guard: edits made to the article are in its draft row before the 寫文章 page is left (the three views were tabs
// sharing one state before; as pages, leaving unmounts the editor). Same save path as the autosave (POST /api/content/drafts).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SITE: ManagedSite = {
  id: S1, name: "主站", url: "https://aaaa.example.com", color: "var(--accent)",
  active: true, tokenSet: true, usernameSet: true, note: null, source: "db", organization_id: A,
};
const SNAPSHOT = { keyword: "舊稿" };

let saveOk = true;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  nav.search = `org=${A}&site=${S1}&draft=${D}`;
  nav.replace.mockReset(); nav.push.mockReset();
  saveOk = true;
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (url.startsWith("/api/content/sites")) return ok({ ok: true, sites: [SITE] });
    if (url.startsWith(`/api/content/drafts?id=${D}`)) {
      return ok({ ok: true, draft: { id: D, markdown: "# 舊稿內文", meta: null, slugHint: null, formSnapshot: SNAPSHOT, keyword: "舊稿", organizationId: A, siteId: S1 } });
    }
    if (url === "/api/content/drafts" && init?.method === "POST") return ok(saveOk ? { ok: true, draft: { id: D } } : { ok: false, error: "db down" });
    return ok({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const saves = () => fetchMock.mock.calls.filter(([u, i]) => String(u) === "/api/content/drafts" && (i as RequestInit | undefined)?.method === "POST");

async function openWithDraft() {
  render(
    <ClientContextProvider sitesPath="/api/content/sites" sessionOrg={null} hostOrg={null} internalOrgId={null} hosts={{}} onDoor={false}>
      <a href="/tools/content/drafts">草稿</a>
      <ContentStudio view="generate" heading={<h1>寫文章</h1>} />
    </ClientContextProvider>,
  );
  await screen.findByText("產出文章");
  fireEvent.click(screen.getByText("✏️ 編輯 MD"));
  return screen.getByPlaceholderText("文章將在此串流顯示…") as HTMLTextAreaElement;
}

describe("寫文章 leave guard (U11)", () => {
  it("an edited article is saved before the page is left, then the link is followed", async () => {
    const box = await openWithDraft();
    fireEvent.change(box, { target: { value: "# 舊稿內文\n手改的一段" } });
    fireEvent.click(screen.getByText("草稿"));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/tools/content/drafts"));
    expect(saves()).toHaveLength(1);
    expect(JSON.parse(String((saves()[0][1] as RequestInit).body)).markdown).toBe("# 舊稿內文\n手改的一段");
  });

  it("a failed save keeps the page and says why", async () => {
    saveOk = false;
    const box = await openWithDraft();
    fireEvent.change(box, { target: { value: "# 舊稿內文\n手改的一段" } });
    fireEvent.click(screen.getByText("草稿"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("沒有離開這一頁");
    expect(nav.push).not.toHaveBeenCalled();
    expect(box.value).toBe("# 舊稿內文\n手改的一段");
  });

  it("no edits: the link is not held and no save is made", async () => {
    await openWithDraft();
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    screen.getByText("草稿").dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(saves()).toHaveLength(0);
  });

  it("closing or reloading the tab with unsaved edits asks first", async () => {
    const box = await openWithDraft();
    fireEvent.change(box, { target: { value: "# 改過" } });
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
