// video-unify-plan-20261116 §4 U1: a (wb) page has no door menu and runs only inside the workbench shell.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/portal/door-access", () => ({ doorAccess: async () => "open" }));

import { ProductDoorShell } from "../../../ProductDoorShell";
import { enterWorkbench } from "../workbench";

describe("bare door shell", () => {
  it("renders the page without the door menu or the sign-out foot; the normal shell keeps both", async () => {
    const bare = renderToStaticMarkup(await ProductDoorShell({ productKey: "video", bare: true, children: <p>作品頁</p> }));
    expect(bare).toContain("作品頁");
    expect(bare).not.toContain("door-nav");
    expect(bare).not.toContain("door-foot");
    const full = renderToStaticMarkup(await ProductDoorShell({ productKey: "video", children: <p>作品頁</p> }));
    expect(full).toContain("door-nav");
    expect(full).toContain("door-foot");
  });
});

describe("enterWorkbench", () => {
  it("a (wb) page opened on its own goes to the shell, which opens it by name, and loads nothing", () => {
    const replace = vi.fn(), createElement = vi.fn();
    const host = { location: { pathname: "/works", search: "", replace }, document: { createElement, body: { append: vi.fn() } } } as unknown as Parameters<typeof enterWorkbench>[0] & { parent: unknown };
    host.parent = host;
    expect(enterWorkbench(host)).toBeNull();
    expect(replace).toHaveBeenCalledWith("/?open=works");
    expect(createElement).not.toHaveBeenCalled();
  });

  it("keeps the page's query for the shell", () => {
    const replace = vi.fn();
    const host = { location: { pathname: "/review-release", search: "?organizationId=o&asset=a&section=release", replace }, document: {} } as unknown as Parameters<typeof enterWorkbench>[0] & { parent: unknown };
    host.parent = host;
    expect(enterWorkbench(host)).toBeNull();
    expect(replace).toHaveBeenCalledWith("/?open=review-release&organizationId=o&asset=a&section=release");
  });
});
