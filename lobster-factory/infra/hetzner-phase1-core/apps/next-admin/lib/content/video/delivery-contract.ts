import { createHash } from "crypto";

export type DeliveryDestination = "wordpress" | "postiz";
export type DeliveryStatus = "queued" | "dispatching" | "drafted" | "scheduled" | "published" | "failed" | "withdrawn";
export interface DeliveryReceipt { readonly id: string; readonly releaseId: string; readonly destination: DeliveryDestination; readonly status: DeliveryStatus; readonly externalId?: string; readonly idempotencyKey: string; readonly attempt: number; readonly dispatchToken?: string; }
export interface DeliveryEvent { readonly type: "drafted" | "scheduled" | "published" | "failed" | "withdrawn"; readonly externalId?: string; }
const transitions: Record<DeliveryStatus, readonly DeliveryEvent["type"][]> = {
  queued: [], dispatching: ["drafted", "scheduled", "published", "failed"], drafted: ["scheduled", "published", "failed", "withdrawn"], scheduled: ["published", "failed", "withdrawn"], published: ["withdrawn"], failed: [], withdrawn: [],
};
export function deliveryIdempotencyKey(releaseId: string, destination: DeliveryDestination, variant: string): string { return createHash("sha256").update(`${releaseId}\0${destination}\0${variant}`).digest("hex"); }
export function applyDeliveryEvent(receipt: DeliveryReceipt, event: DeliveryEvent): DeliveryReceipt {
  if (!transitions[receipt.status].includes(event.type)) throw new Error(`invalid delivery transition ${receipt.status} -> ${event.type}`);
  return { ...receipt, status: event.type, externalId: event.externalId ?? receipt.externalId };
}
