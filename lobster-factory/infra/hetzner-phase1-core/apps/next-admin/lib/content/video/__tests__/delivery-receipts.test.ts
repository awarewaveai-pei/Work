import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));

import { claimDeliveryReceipt } from "../delivery-receipts";

const receipt = {
  id: "delivery-1", releaseId: "release-1", destination: "postiz" as const,
  status: "queued" as const, idempotencyKey: "a".repeat(64), attempt: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED = "true";
});
afterEach(() => { delete process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED; });

describe("delivery dispatch claim", () => {
  it("requires the database atomic claim before an external effect", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      id: "delivery-1", release_id: "release-1", destination: "postiz", status: "dispatching",
      external_id: null, idempotency_key: "a".repeat(64), attempt: 1, dispatch_token: "claim-1", claimed: true,
    }], error: null });
    getSupabaseWriteClient.mockReturnValue({ rpc });
    await expect(claimDeliveryReceipt(receipt)).resolves.toMatchObject({ claimed: true, receipt: { status: "dispatching", dispatchToken: "claim-1", attempt: 1 } });
    expect(rpc).toHaveBeenCalledWith("media_delivery_claim", { p_idempotency_key: "a".repeat(64) });
  });

  it("does not turn a completed receipt into another dispatch", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      id: "delivery-1", release_id: "release-1", destination: "postiz", status: "published",
      external_id: "external-1", idempotency_key: "a".repeat(64), attempt: 1, dispatch_token: "claim-1", claimed: false,
    }], error: null });
    getSupabaseWriteClient.mockReturnValue({ rpc });
    await expect(claimDeliveryReceipt(receipt)).resolves.toMatchObject({ claimed: false, receipt: { status: "published", externalId: "external-1" } });
  });
});
