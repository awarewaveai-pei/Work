import { describe, expect, it } from "vitest";
import { applyDeliveryEvent, deliveryIdempotencyKey, type DeliveryReceipt } from "../delivery-contract";

const receipt: DeliveryReceipt = { id: "d1", releaseId: "r1", destination: "postiz", status: "queued", idempotencyKey: deliveryIdempotencyKey("r1", "postiz", "vertical"), attempt: 0 };
describe("delivery contract", () => {
  it("derives stable destination-scoped idempotency keys", () => {
    expect(deliveryIdempotencyKey("r1", "postiz", "vertical")).toHaveLength(64);
    expect(deliveryIdempotencyKey("r1", "postiz", "vertical")).toBe(deliveryIdempotencyKey("r1", "postiz", "vertical"));
    expect(deliveryIdempotencyKey("r1", "postiz", "vertical")).not.toBe(deliveryIdempotencyKey("r1", "wordpress", "vertical"));
  });
  it("allows only a claimed dispatch to change external state", () => {
    expect(() => applyDeliveryEvent(receipt, { type: "drafted", externalId: "p1" })).toThrow(/invalid delivery transition/);
    const claimed: DeliveryReceipt = { ...receipt, status: "dispatching", attempt: 1, dispatchToken: "claim" };
    const failed = applyDeliveryEvent(claimed, { type: "failed" });
    expect(failed.attempt).toBe(1);
    const retry: DeliveryReceipt = { ...failed, status: "dispatching", attempt: 2, dispatchToken: "claim-2" };
    const drafted = applyDeliveryEvent(retry, { type: "drafted", externalId: "p1" });
    const published = applyDeliveryEvent(drafted, { type: "published" });
    const withdrawn = applyDeliveryEvent(published, { type: "withdrawn" });
    expect(withdrawn.status).toBe("withdrawn");
    expect(() => applyDeliveryEvent(withdrawn, { type: "published" })).toThrow(/invalid delivery transition/);
  });
});
