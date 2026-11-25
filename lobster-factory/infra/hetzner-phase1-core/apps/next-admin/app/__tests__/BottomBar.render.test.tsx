// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const nav = vi.hoisted(() => ({ path: "/", search: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useSearchParams: () => new URLSearchParams(nav.search) }));

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

describe("phone bottom bar keeps the current client (ADR 020)", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const S = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  afterEach(() => { nav.search = ""; });

  it("staff on a door: the console links carry org and site; a customer's portal links carry neither", () => {
    nav.search = `org=${A}&site=${S}`;
    const staff = bar({ kind: "staff-door", staffOrigin: "https://app.example.test" });
    expect(staff).toContain(`href="https://app.example.test/?org=${A}&amp;site=${S}"`);
    expect(staff).toContain(`href="https://app.example.test/ops/clients?org=${A}&amp;site=${S}"`);
    const member = bar({ kind: "member", portalOrigin: "https://portal.example.test" });
    expect(member).toContain('href="https://portal.example.test/launcher"');
    expect(member).toContain('href="https://portal.example.test/wallet"');
  });
});

describe("「更多」 covers the page for the keyboard too", () => {
  afterEach(cleanup);

  it("open: the page is inert (not the menu, the client rail or the bar), focus in the menu; Esc undoes both", () => {
    nav.path = "/tools/content";
    const { container } = render(
      <MobileShell items={[]}>
        <nav className="sidebar"><a href="/x">選單項</a></nav>
        <div className="main"><div><aside className="client-rail"><button type="button">客戶</button></aside><div id="page"><button type="button">頁面鈕</button></div></div></div>
      </MobileShell>,
    );
    const inert = () => [...container.querySelectorAll("[inert]")].map((e) => e.id || e.className);
    const more = screen.getByRole("button", { name: "更多" });
    expect(inert()).toEqual([]);
    fireEvent.click(more);
    expect(inert()).toEqual(["page"]);
    expect(document.activeElement?.textContent).toBe("選單項");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(inert()).toEqual([]);
    expect(document.activeElement).toBe(more);
  });

  it("a door page with no client rail: the whole content column is inert", () => {
    const { container } = render(
      <MobileShell items={[]}>
        <div className="door-main"><aside className="door-side"><a href="/x">寫文章</a></aside><div className="door-content"><button type="button">頁面鈕</button></div></div>
      </MobileShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    expect([...container.querySelectorAll("[inert]")].map((e) => e.className)).toEqual(["door-content"]);
  });
});
