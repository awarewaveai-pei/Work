// The launcher's cards come from the doors' own check (heldDoors -> holdsProduct), so "回到我的產品" on a door's
// not-enabled page lands on a list that agrees with the doors.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ held: new Set<string>(), fail: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-ops-user-kind": "client", "x-ops-org-id": "org-1" }),
}));
vi.mock("@/lib/entitlements/door-holds", () => ({
  holdsProduct: async ({ productKey }: { productKey: string }) => {
    if (state.fail) throw new Error("db down");
    return state.held.has(productKey);
  },
}));

import PortalLauncherPage from "../page";
import { PRODUCTS } from "@/lib/portal/products";
import { shopUrl } from "@/lib/portal/hosts";

const card = (html: string, name: string) => html.split('<div class="card"').find((c) => c.includes(`>${name}</h2>`)) ?? "";
const name = (key: string) => PRODUCTS.find((p) => p.key === key)!.name;

describe("portal launcher", () => {
  beforeEach(() => { state.held = new Set(); state.fail = false; });

  it("a held, served door opens; a served door not held says 尚未開通; a closed door says 即將推出", async () => {
    state.held = new Set(["tarot", "cs"]);
    const html = renderToStaticMarkup(await PortalLauncherPage());
    expect(card(html, name("tarot"))).toContain("已開通");
    expect(card(html, name("tarot"))).toMatch(/href="https:\/\/tarot\.[^"]+"[^>]*>開啟</);
    expect(card(html, name("content"))).toContain("尚未開通");
    expect(card(html, name("content"))).not.toContain("開啟");
    // cs is held but its door is not served yet (products.ts enabled:false): never offered
    expect(card(html, name("cs"))).toContain("即將推出");
    expect(card(html, name("cs"))).not.toContain("開啟");
  });

  it("a held door with a works page links to it; one without does not; a door not held points to the shop", async () => {
    state.held = new Set(["tarot", "content", "design"]);
    const html = renderToStaticMarkup(await PortalLauncherPage());
    expect(card(html, name("tarot"))).toMatch(/href="https:\/\/tarot\.[^"]+\/works"[^>]*>我的作品</);
    expect(card(html, name("content"))).toContain("已開通");
    expect(card(html, name("content"))).not.toContain("我的作品");
    // the design door's home is the works library: one 開啟 button, no second link to the same page
    expect(card(html, name("design"))).toMatch(/href="https:\/\/design\.[^"]+"[^>]*>開啟</);
    expect(card(html, name("design"))).not.toContain("我的作品");
    expect(card(html, name("studio"))).not.toContain("我的作品");
    expect(card(html, name("studio"))).toContain(`href="${shopUrl()}"`);
    expect(card(html, name("studio"))).toContain(">去了解<");
    expect(card(html, name("cs"))).not.toContain("去了解");
  });

  it("a failed entitlement read shows the error and opens nothing", async () => {
    state.held = new Set(["tarot"]);
    state.fail = true;
    const html = renderToStaticMarkup(await PortalLauncherPage());
    expect(html).toContain("讀取產品清單時發生錯誤");
    expect(html).not.toContain("href=");
  });
});
