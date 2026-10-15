import { describe, expect, it } from "vitest";
import { doorForHost, portalHost, productHost, routeOnProductDoor, type NextAdminProduct } from "../doors";
import { PRODUCTS } from "../products";

// ADR 018 §2: hosts come from config, so a buyout install on a customer's domain changes env only.
const social = PRODUCTS.find((p) => p.key === "social")!;

describe("doorForHost", () => {
  it("defaults to aware-wave.com; a port and case are ignored; unknown hosts are the staff door", () => {
    expect(doorForHost("social.aware-wave.com", {})).toMatchObject({ kind: "product", product: { key: "social" } });
    expect(doorForHost("Social.Aware-Wave.com:443", {})).toMatchObject({ kind: "product" });
    expect(doorForHost("portal.aware-wave.com", {})).toEqual({ kind: "portal" });
    expect(doorForHost("app.aware-wave.com", {})).toEqual({ kind: "staff" });
    expect(doorForHost("", {})).toEqual({ kind: "staff" });
    // external products (cognitive, hci) are not served here, so their hosts are not a door of this app
    expect(doorForHost("cognitive.aware-wave.com", {})).toEqual({ kind: "staff" });
  });

  it("a buyout install: base domain and per-product override come from env", () => {
    const env = { PUBLIC_BASE_DOMAIN: "customer.com", PRODUCT_HOST_SOCIAL: "posts.customer.com" };
    expect(productHost(social, env)).toBe("posts.customer.com");
    expect(portalHost(env)).toBe("portal.customer.com");
    expect(doorForHost("posts.customer.com", env)).toMatchObject({ kind: "product", product: { key: "social" } });
    expect(doorForHost("social.aware-wave.com", env)).toEqual({ kind: "staff" });
    expect(productHost(social, { PUBLIC_BASE_DOMAIN: "customer.com" })).toBe("social.customer.com");
  });
});

describe("routeOnProductDoor", () => {
  const p = social as NextAdminProduct;
  it.each([
    ["/", { action: "rewrite", pathname: "/social" }],
    ["/calendar", { action: "rewrite", pathname: "/social/calendar" }],
    ["/ops/clients", { action: "rewrite", pathname: "/social/ops/clients" }],
    ["/social", { action: "pass" }],
    ["/social/x", { action: "pass" }],
    ["/api/social/posts", { action: "pass" }],
    ["/api/social", { action: "pass" }],
    ["/api/socialx", { action: "not_found" }],
    ["/api/ops/clients", { action: "not_found" }],
    ["/api/content/syndicate", { action: "not_found" }],
    ["/portal/api/signup", { action: "not_found" }],
  ])("%s -> %j", (path, expected) => {
    expect(routeOnProductDoor(path, p)).toEqual(expected);
  });
});
