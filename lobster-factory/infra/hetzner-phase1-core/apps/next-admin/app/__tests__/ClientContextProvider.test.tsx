// @vitest-environment jsdom
//
// Provider（K4）：網站清單全頁只抓一次；換網址參數不 remount 也重算；舊參數 siteId 改寫成 site；
// 客戶帳號 site 層清單未載入 → loading。
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientContextProvider } from "../ClientContextProvider";
import { useClientContext } from "@/lib/client-context/use-client-context";
import type { Layer } from "@/lib/client-context/contract";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/tools/content",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const A = "11111111-1111-4111-8111-111111111111";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({
    ok: true,
    sites: [{ id: S1, name: "主站", organization_id: A }, { id: S2, name: "部落格", organization_id: A }],
  })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Probe({ layer, tag }: { layer: Layer; tag: string }) {
  const c = useClientContext(layer);
  return <div data-testid={tag}>{`${c.status}|${c.org ?? ""}|${c.site ?? ""}`}</div>;
}

function tree(sessionOrg: string | null = null) {
  return (
    <ClientContextProvider sitesPath="/api/content/sites" sessionOrg={sessionOrg} hostOrg={null} internalOrgId={null} hosts={{}} onDoor={false}>
      <Probe layer="site" tag="a" />
      <Probe layer="site" tag="b" />
    </ClientContextProvider>
  );
}

describe("ClientContextProvider", () => {
  it("two consumers, one sites fetch", async () => {
    nav.search = `org=${A}&site=${S1}`;
    render(tree());
    await waitFor(() => expect(screen.getByTestId("a").textContent).toBe(`ok|${A}|${S1}`));
    expect(screen.getByTestId("b").textContent).toBe(`ok|${A}|${S1}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/content/sites?organizationId=${A}`);
  });

  it("URL change recomputes without remount and without refetching the same client", async () => {
    nav.search = `org=${A}&site=${S1}`;
    const { rerender } = render(tree());
    await waitFor(() => expect(screen.getByTestId("a").textContent).toBe(`ok|${A}|${S1}`));
    nav.search = `org=${A}&site=${S2}`;
    rerender(tree());
    await waitFor(() => expect(screen.getByTestId("a").textContent).toBe(`ok|${A}|${S2}`));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("legacy siteId is rewritten to site", async () => {
    nav.search = `org=${A}&siteId=${S1}`;
    render(tree());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/tools/content?org=${A}&site=${S1}`));
  });

  it("client account, site layer, sites not loaded yet -> loading", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(tree(A));
    expect(screen.getByTestId("a").textContent).toBe(`loading|${A}|`);
  });

  it("a door without the sites API: a site-layer page is treated as org, and no sites request goes out", async () => {
    nav.search = `org=${A}&site=${S1}`;
    render(
      <ClientContextProvider sitesPath={null} sessionOrg={null} hostOrg={null} internalOrgId={null} hosts={{}} onDoor>
        <Probe layer="site" tag="a" />
      </ClientContextProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("a").textContent).toBe(`ok|${A}|`));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
