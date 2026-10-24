import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ fetchProductSpec: vi.fn() }));
vi.mock("../../../../../lib/studio/printful-catalog", () => ({ fetchProductSpec: m.fetchProductSpec }));

import { POST } from "./route";
import { POD_PRODUCT_MODELS } from "@/lib/studio/pod-catalog-config";

const post = (body: unknown) => POST(new Request("http://localhost/api/tools/studio/mockup", {
  method: "POST",
  headers: { "content-type": "application/json", "x-ops-user-kind": "client", "x-ops-org-id": "org-1" },
  body: JSON.stringify(body),
}));
const IMAGE = "https://pub-test.r2.dev/designs/design.png";

beforeEach(() => { vi.stubEnv("POD_DESIGNS_ENABLED", "true"); m.fetchProductSpec.mockReset().mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/tools/studio/mockup -- served on product doors", () => {
  it("refuses a product we do not sell before spending the shared Printful store's quota", async () => {
    const res = await post({ imageUrl: IMAGE, productId: 999_999 });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "unknown_product" });
    expect(m.fetchProductSpec).not.toHaveBeenCalled();
  });

  it("a sold product passes the check and asks Printful for its spec", async () => {
    await post({ imageUrl: IMAGE, productId: POD_PRODUCT_MODELS[0].catalogProductId });
    expect(m.fetchProductSpec).toHaveBeenCalledWith(POD_PRODUCT_MODELS[0].catalogProductId, "white");
  });
});
