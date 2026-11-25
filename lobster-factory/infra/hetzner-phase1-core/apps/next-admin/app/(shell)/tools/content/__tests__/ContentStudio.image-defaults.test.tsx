// @vitest-environment jsdom
//
// K10: the article page opens with the site's image style and model and the 4:3 ratio; picking another style or ratio
// for this article changes the page only -- the site is never written back.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { ClientContextProvider } from "@/app/ClientContextProvider";
import { ClientRail } from "@/app/ClientRail";
import { STYLE_CATALOG } from "@/app/(shell)/tools/tarot/tarotStyles";
import ContentStudio from "../ContentStudio";

const A = "11111111-1111-4111-8111-111111111111";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/tools/content",
  useSearchParams: () => new URLSearchParams(`org=${A}&site=${S1}`),
}));

const WATERCOLOR = STYLE_CATALOG.find((s) => s.group === "媒材")!;
const OIL = STYLE_CATALOG.find((s) => s.group === "西方畫家")!;
const SITE: ManagedSite = {
  id: S1, name: "主站", url: "https://aaaa.example.com", color: "var(--accent)", active: true, tokenSet: true, usernameSet: true,
  note: null, source: "db", organization_id: A, contentDefaults: { imageStyle: WATERCOLOR.zh, imageModel: "nano-banana-2" },
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ContentStudio -- the site's image defaults (K10)", () => {
  it("brings in the site's style, model and 4:3; a change for this article sends nothing to the site", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
      if (url.startsWith("/api/ops/org-search")) return ok({ ok: true, orgs: [], total: 0 });
      if (url.startsWith("/api/content/sites")) return ok({ ok: true, sites: [SITE] });
      return ok({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ClientContextProvider sitesPath="/api/content/sites" sessionOrg={null} hostOrg={null} internalOrgId={null} hosts={{}} onDoor={false}>
        <ClientRail />
        <ContentStudio />
      </ClientContextProvider>,
    );
    await screen.findByText(SITE.url + " ↗");
    fireEvent.click(screen.getByRole("button", { name: /^進階設定/ }));
    fireEvent.click(screen.getByRole("button", { name: /^媒體/ }));

    const style = await screen.findByRole("group", { name: "配圖風格（只改這篇）" });
    await waitFor(() => expect(within(style).getByRole("button", { name: WATERCOLOR.zh.split("｜")[0] }).getAttribute("aria-pressed")).toBe("true"));
    const ratio = screen.getByRole("group", { name: "內文圖片比例" });
    expect(within(ratio).getByRole("button", { name: /^4:3/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(screen.getByRole("group", { name: "AI 圖片" })).getByRole("button", { name: /^Nano Banana 2\.1/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(style).getByRole("button", { name: "西方畫家" }));
    fireEvent.click(within(style).getByRole("button", { name: OIL.zh.split("｜")[0] }));
    fireEvent.click(within(ratio).getByRole("button", { name: /^16:9/ }));
    expect(within(style).getByRole("button", { name: OIL.zh.split("｜")[0] }).getAttribute("aria-pressed")).toBe("true");
    expect(within(ratio).getByRole("button", { name: /^16:9/ }).getAttribute("aria-pressed")).toBe("true");
    const writes = fetchMock.mock.calls.filter(([u, init]) => String(u).startsWith("/api/content/sites") && init?.method);
    expect(writes).toEqual([]);
  });
});
