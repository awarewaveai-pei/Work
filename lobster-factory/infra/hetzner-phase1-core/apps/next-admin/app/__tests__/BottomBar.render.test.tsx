import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const nav = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useSearchParams: () => new URLSearchParams() }));

import { MobileShell } from "../MobileShell";
import { bottomItems, type BottomViewer } from "../bottom-items";

const bar = (viewer: BottomViewer, path = "/") => {
  nav.path = path;
  const html = renderToStaticMarkup(<MobileShell items={bottomItems(viewer)}><p>頁面</p></MobileShell>);
  return html.slice(html.indexOf('<nav class="bottom-bar"'));
};
const labels = (html: string) => [...html.matchAll(/>([^<>]+)<\/(?:a|button)>/g)].map((m) => m[1]);
const current = (html: string) => [...html.matchAll(/aria-current="page">([^<]+)</g)].map((m) => m[1]);

describe("phone bottom bar (blueprint §9.1)", () => {
  it("staff console: 工作台, 客戶, 更多; the current page is marked, sub-pages count", () => {
    const staff: BottomViewer = { kind: "staff", visible: null };
    expect(labels(bar(staff))).toEqual(["工作台", "客戶", "更多"]);
    expect(current(bar(staff))).toEqual(["工作台"]);
    expect(current(bar(staff, "/ops/clients/acme"))).toEqual(["客戶"]);
    expect(current(bar(staff, "/tools/content"))).toEqual([]);
    expect(bar(staff)).toContain('aria-expanded="false"');
  });

  it("a restricted staff member gets no link to a page their grant hides", () => {
    expect(labels(bar({ kind: "staff", visible: ["/tools/content"] }))).toEqual(["更多"]);
  });

  it("a customer on a door: their workspace and credits on the portal host", () => {
    const html = bar({ kind: "member", portalOrigin: "https://portal.example.test" }, "/topics");
    expect(labels(html)).toEqual(["工作台", "點數與合約", "更多"]);
    expect(html).toContain('href="https://portal.example.test/launcher"');
    expect(html).toContain('href="https://portal.example.test/wallet"');
    expect(current(html)).toEqual([]);
  });

  it("staff on a door: links go to the console host, and none without one", () => {
    expect(bar({ kind: "staff-door", staffOrigin: "https://app.example.test" })).toContain('href="https://app.example.test/ops/clients"');
    expect(labels(bar({ kind: "staff-door", staffOrigin: undefined }))).toEqual(["更多"]);
  });
});
