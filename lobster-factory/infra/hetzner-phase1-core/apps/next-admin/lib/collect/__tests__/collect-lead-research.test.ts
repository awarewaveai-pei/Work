// Lead research crawl options (lib/collect/run.ts runLeadResearch): a shop's machinery pages are never queued, and a
// page whose documents were all refused still nominates links when the run asks for it (orchestrator expandRefused).
import { describe, expect, it } from "vitest";
import { isTransactionalLink } from "@/lib/collect/run";

describe("isTransactionalLink", () => {
  it("cart, checkout, account, login, feeds and add-to-cart links are skipped; content pages are not", () => {
    for (const u of ["https://a.example/cart/", "https://a.example/checkout", "https://a.example/my-account/orders", "https://a.example/wp-login.php",
      "https://a.example/?add-to-cart=12", "https://a.example/feed/", "https://a.example/?s=yoga"]) expect(isTransactionalLink(u)).toBe(true);
    for (const u of ["https://a.example/about/", "https://a.example/services/yoga", "https://a.example/cartography", "https://a.example/accounting-services"])
      expect(isTransactionalLink(u)).toBe(false);
  });
});
