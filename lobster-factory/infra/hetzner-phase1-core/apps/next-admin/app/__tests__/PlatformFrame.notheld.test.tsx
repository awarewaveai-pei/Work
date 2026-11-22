// U9: the 尚未開通 page has a second way out. 「了解這個產品」 appears only when the registry gives the product an intro slug
// (catalog.intro), so it never links to a page that is not there; 「回到我的產品」 stays either way.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-ops-user-kind": "client", "x-ops-org-id": "org-1" }) }));
vi.mock("@/lib/portal/door-access", () => ({ doorAccess: async () => "not_held" }));
vi.mock("../LogoutButton", () => ({ LogoutButton: () => <button>登出</button> }));

import { PlatformFrame, introUrl } from "../PlatformFrame";
import { PRODUCTS } from "@/lib/portal/products";

const html = async () => renderToStaticMarkup(await PlatformFrame({ kind: "door", productKey: "content", children: null }));

describe("not-enabled door page", () => {
  it("introUrl: slug -> https://<base>/<slug>/; empty or missing -> null", () => {
    expect(introUrl("content-marketing", { PUBLIC_BASE_DOMAIN: "example.test" })).toBe("https://example.test/content-marketing/");
    expect(introUrl("/a/", {})).toBe("https://aware-wave.com/a/");
    expect(introUrl(undefined)).toBeNull();
    expect(introUrl("  ")).toBeNull();
  });

  it("no intro in the registry: only 回到我的產品", async () => {
    const product = PRODUCTS.find((p) => p.key === "content")!;
    expect(product.catalog.intro).toBeUndefined();
    const out = await html();
    expect(out).toContain("尚未開通");
    expect(out).toContain("回到我的產品");
    expect(out).not.toContain("了解這個產品");
  });

  it("intro set: 了解這個產品 links to it and 回到我的產品 stays", async () => {
    const product = PRODUCTS.find((p) => p.key === "content")!;
    product.catalog.intro = "content-marketing";
    try {
      const out = await html();
      expect(out).toContain('href="https://aware-wave.com/content-marketing/"');
      expect(out).toContain("了解這個產品");
      expect(out).toContain("回到我的產品");
    } finally {
      delete product.catalog.intro;
    }
  });
});
