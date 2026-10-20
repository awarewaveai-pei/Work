import type { SupabaseClient } from "@supabase/supabase-js";

// PLACEHOLDER policy: no source for per-feature minimum charge / single-call cap exists yet (card 3 gap). Units are
// media_credit_ledger integer units. Replace with plan data before credits features go live.
export const DEFAULT_CREDIT_POLICY = { minimumCharge: 1, singleLimit: 1000 } as const;
export const creditPolicy = async () => ({ ...DEFAULT_CREDIT_POLICY });

/** Debits the billing account through the 0066 reserve RPC (atomic, idempotent on the key). false = refused. */
export async function debitCredits(db: SupabaseClient, input: { orgId: string; units: number; idempotencyKey: string; featureKey: string }): Promise<boolean> {
  if (!Number.isInteger(input.units) || input.units <= 0) throw new Error("invalid_debit_units");
  const { data, error } = await db.rpc("media_credit_reserve", {
    p_organization_id: input.orgId, p_units: input.units, p_idempotency_key: input.idempotencyKey,
    p_reference_type: "entitlement", p_reference_id: input.featureKey,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row?.allowed === true;
}
