import { describe, expect, it } from "vitest";
import { applyDeliveryEvent, deliveryIdempotencyKey, type DeliveryReceipt } from "../delivery-contract";

const receipt: DeliveryReceipt = { id: "d1", releaseId: "r1", destination: "postiz", status: "queued", idempotencyKey: deliveryIdempotencyKey("r1", "postiz", "vertical"), attempt: 0 };
describe("delivery contract", () => {
  it("derives stable destination-scoped idempotency keys", () => {
    expect(deliveryIdempotencyKey("r1", "postiz", "vertical")).toHaveLength(64);
    expect(deliveryIdempotencyKey("r1", "postiz", "vertical")).toBe(deliveryIdempotencyKey("r1", "postiz", "vertical"));
    expect(deliveryIdempotencyKey("r1", "postiz", "vertical")).not.toBe(deliveryIdempotencyKey("r1", "wordpress", "vertical"));
  });
  it("allows retry after failure and blocks republish after withdrawal", () => {
    const failed = applyDeliveryEvent(receipt, { type: "failed" });
    expect(failed.attempt).toBe(1);
    const drafted = applyDeliveryEvent(failed, { type: "drafted", externalId: "p1" });
    const published = applyDeliveryEvent(drafted, { type: "published" });
    const withdrawn = applyDeliveryEvent(published, { type: "withdrawn" });
    expect(withdrawn.status).toBe("withdrawn");
    expect(() => applyDeliveryEvent(withdrawn, { type: "published" })).toThrow(/invalid delivery transition/);
  });
});
