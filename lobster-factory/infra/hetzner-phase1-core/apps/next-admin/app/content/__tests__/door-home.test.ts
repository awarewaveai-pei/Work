// U16: old /content?draft= links still open the draft, and the door-only 概覽 item maps no staff link.
import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect, usePathname: () => "/content", useSearchParams: () => new URLSearchParams() }));

import ContentDoorPage from "../page";
import { doorHref } from "@/lib/portal/door-href";
import { PRODUCTS } from "@/lib/portal/products";

describe("content door home", () => {
  it("/content?draft= goes to /write with the rest of the query", async () => {
    await ContentDoorPage({ searchParams: Promise.resolve({ org: "o1", site: "s1", draft: "d1" }) });
    expect(redirect.mock.calls).toEqual([["/write?org=o1&site=s1&draft=d1"]]);
    redirect.mockClear();
    await ContentDoorPage({ searchParams: Promise.resolve({ org: "o1" }) });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("a nav item without staff is never the target of a staff link", () => {
    const door = PRODUCTS.find((p) => p.key === "content")!.door;
    const nav = door.app === "next-admin" ? door.nav! : [];
    const only = nav.filter((n) => n.staff === undefined);
    expect(only.map((n) => n.path)).toEqual([""]);
    expect(doorHref(only, "/undefined")).toBeNull();
    expect(doorHref(only, "/tools/content")).toBeNull();
    expect(doorHref(nav, "/tools/events")).toBe("/events");
    expect(doorHref(nav, "/tools/content")).toBe("/write");
  });
});
