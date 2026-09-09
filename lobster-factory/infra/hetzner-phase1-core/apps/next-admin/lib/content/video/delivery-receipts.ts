import { getSupabaseWriteClient } from "@/lib/supabase-server";
import {
  applyDeliveryEvent,
  deliveryIdempotencyKey,
  type DeliveryDestination,
  type DeliveryEvent,
  type DeliveryReceipt,
  type DeliveryStatus,
} from "./delivery-contract";

export type { DeliveryReceipt } from "./delivery-contract";

/**
 * Persistence is opt-in until migration 0065 has been rehearsed and applied.
 * The adapter is deliberately fail-soft for legacy callers: publishing must
 * keep its existing behaviour when the new tables are not yet available.
 */
export function mediaPersistenceEnabled(): boolean {
  return process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED === "true";
}

export type DeliveryReceiptContext = {
  organizationId: string;
  releaseId: string;
  destination: DeliveryDestination;
  variant: string;
};

/**
 * A delivery receipt is only valid for an approved Release owned by the same
 * tenant.  Keeping this check inside the adapter protects every caller
 * (WordPress, Postiz, and future destinations) from cross-tenant or
 * pre-approval delivery when the persistence flag is enabled.
 */
async function assertReleaseReady(organizationId: string, releaseId: string): Promise<void> {
  const db = getSupabaseWriteClient();
  if (!db) throw new Error("Supabase service role is required for delivery receipts");
  const { data, error } = await db
    .from("media_releases")
    .select("id, organization_id, status")
    .eq("id", releaseId)
    .maybeSingle();
  if (error) throw new Error(`media_releases lookup failed: ${error.message}`);
  if (!data || data.organization_id !== organizationId) {
    throw new Error("release_not_found");
  }
  if (data.status !== "release_approved") {
    throw new Error("release_not_approved");
  }
}

type DeliveryRow = {
  id: string;
  release_id: string;
  destination: DeliveryDestination;
  status: DeliveryStatus;
  external_id: string | null;
  idempotency_key: string;
  attempt: number;
};

function toReceipt(row: DeliveryRow): DeliveryReceipt {
  return {
    id: row.id,
    releaseId: row.release_id,
    destination: row.destination,
    status: row.status,
    ...(row.external_id ? { externalId: row.external_id } : {}),
    idempotencyKey: row.idempotency_key,
    attempt: row.attempt,
  };
}

/** Create or retrieve the idempotent receipt for one release destination. */
export async function ensureDeliveryReceipt(
  context: DeliveryReceiptContext,
): Promise<DeliveryReceipt | null> {
  if (!mediaPersistenceEnabled()) return null;
  const db = getSupabaseWriteClient();
  if (!db) throw new Error("Supabase service role is required for delivery receipts");
  await assertReleaseReady(context.organizationId, context.releaseId);

  const idempotencyKey = deliveryIdempotencyKey(
    context.releaseId,
    context.destination,
    context.variant,
  );
  const { data, error } = await db
    .from("media_delivery_attempts")
    .upsert(
      {
        organization_id: context.organizationId,
        release_id: context.releaseId,
        destination: context.destination,
        variant: context.variant,
        status: "queued",
        idempotency_key: idempotencyKey,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    .select("id, release_id, destination, status, external_id, idempotency_key, attempt")
    .maybeSingle();
  if (error) throw new Error(`media_delivery_attempts insert failed: ${error.message}`);
  if (data) return toReceipt(data as DeliveryRow);

  const existing = await db
    .from("media_delivery_attempts")
    .select("id, release_id, destination, status, external_id, idempotency_key, attempt")
    .eq("idempotency_key", idempotencyKey)
    .single();
  if (existing.error || !existing.data) {
    throw new Error(`media_delivery_attempts lookup failed: ${existing.error?.message ?? "row missing"}`);
  }
  return toReceipt(existing.data as DeliveryRow);
}

/** Apply one validated delivery event and retain the raw adapter response. */
export async function recordDeliveryReceipt(
  receipt: DeliveryReceipt,
  event: DeliveryEvent,
  responseJson: Record<string, unknown> = {},
): Promise<DeliveryReceipt | null> {
  if (!mediaPersistenceEnabled()) return null;
  const db = getSupabaseWriteClient();
  if (!db) throw new Error("Supabase service role is required for delivery receipts");
  const next = applyDeliveryEvent(receipt, event);
  const { data, error } = await db
    .from("media_delivery_attempts")
    .update({
      status: next.status,
      external_id: next.externalId ?? null,
      attempt: next.attempt,
      response_json: responseJson,
      updated_at: new Date().toISOString(),
    })
    .eq("id", receipt.id)
    .select("id, release_id, destination, status, external_id, idempotency_key, attempt")
    .single();
  if (error || !data) throw new Error(`media_delivery_attempts update failed: ${error?.message ?? "row missing"}`);
  return toReceipt(data as DeliveryRow);
}
