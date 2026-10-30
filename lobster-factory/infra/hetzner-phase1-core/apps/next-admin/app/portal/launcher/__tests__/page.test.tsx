// The launcher's cards come from the doors' own check (heldDoors -> holdsProduct), so "回到我的產品" on a door's
// not-enabled page lands on a list that agrees with the doors.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ held: new Set<string>(), fail: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-ops-user-kind": "client", "x-ops-org-id": "org-1" }),
}));
vi.mock("@/app/LogoutButton", () => ({ LogoutButton: () => <button>登出</button> }));
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
const page = (door?: string) => PortalLauncherPage({ searchParams: Promise.resolve(door ? { door } : {}) });
// a door button is a POST form to /portal/api/door, never a link to the door (the door has no session for this person)
const FORM = '<form action="/portal/api/door" method="post"><input type="hidden" name="product_key" value="';

describe("portal launcher", () => {
  beforeEach(() => { state.held = new Set(); state.fail = false; });

  it("a held, served door opens; a served door not held says 尚未開通; a closed door says 即將推出", async () => {
    state.held = new Set(["tarot", "cs"]);
    const html = renderToStaticMarkup(await page());
    expect(card(html, name("tarot"))).toContain("已開通");
    expect(card(html, name("tarot"))).toContain(`${FORM}tarot"/><button class="btn-primary">開啟</button></form>`);
    expect(card(html, name("tarot"))).not.toContain("https://tarot.");
    expect(card(html, name("content"))).toContain("尚未開通");
    expect(card(html, name("content"))).not.toContain("開啟");
    // cs is held but its door is not served yet (products.ts enabled:false): never offered
    expect(card(html, name("cs"))).toContain("即將推出");
    expect(card(html, name("cs"))).not.toContain("開啟");
  });

  it("a held door with a works page links to it; one without does not; a door not held points to the shop", async () => {
    state.held = new Set(["tarot", "content", "design"]);
    const html = renderToStaticMarkup(await page());
    expect(card(html, name("tarot"))).toContain(`${FORM}tarot"/><input type="hidden" name="next" value="/works"/><button class="btn-primary">我的作品</button></form>`);
    expect(card(html, name("content"))).toContain("已開通");
    expect(card(html, name("content"))).not.toContain("我的作品");
    // the design door's home is the works library: one 開啟 button, no second link to the same page
    expect(card(html, name("design"))).toContain(`${FORM}design"/><button class="btn-primary">開啟</button></form>`);
    expect(card(html, name("design"))).not.toContain("我的作品");
    expect(card(html, name("studio"))).not.toContain("我的作品");
    expect(card(html, name("studio"))).toContain(`href="${shopUrl()}"`);
    expect(card(html, name("studio"))).toContain(">去了解<");
    expect(card(html, name("cs"))).not.toContain("去了解");
  });

  it("a failed entitlement read shows the error and opens nothing", async () => {
    state.held = new Set(["tarot"]);
    state.fail = true;
    const html = renderToStaticMarkup(await page());
    expect(html).toContain("讀取產品清單時發生錯誤");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<form");
  });

  it("?door=<code> shows one line saying why the door did not open; no code shows none", async () => {
    state.held = new Set(["tarot"]);
    expect(renderToStaticMarkup(await page("product_not_held"))).toContain("尚未開通這個產品");
    expect(renderToStaticMarkup(await page("email_unverified"))).toContain("請先完成 email 確認再進入");
    expect(renderToStaticMarkup(await page("link_failed"))).toContain("暫時無法進入，請稍後再試");
    // a code that is an Object.prototype name must not read the prototype
    expect(renderToStaticMarkup(await page("constructor"))).toContain("暫時無法進入，請稍後再試");
    const none = renderToStaticMarkup(await page());
    for (const text of ["尚未開通這個產品", "請先完成 email 確認再進入", "暫時無法進入"]) expect(none).not.toContain(text);
  });
});
