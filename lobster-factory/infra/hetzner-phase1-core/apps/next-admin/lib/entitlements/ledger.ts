import type { SupabaseClient } from "@supabase/supabase-js";
import { TWD_RATE } from "@/lib/ai/cost-model";

// Price (ADR 017 4b-11): 1 credit = NT$1; a delivered vendor call costs its own cost x CREDIT_MARKUP, rounded up, at least 1.
// One policy for every feature: the model a customer picks moves the cost up to 100x within one feature. can() lets a call
// start at balance >= minimumCharge; singleLimit caps what one permit may take (NT$1000).
export const CREDIT_MARKUP = 3;
export const DEFAULT_CREDIT_POLICY = { minimumCharge: 1, singleLimit: 1000 } as const;
export const creditPolicy = async () => ({ ...DEFAULT_CREDIT_POLICY });
/** toFixed first: 0.25 * 32 * 3 is 24.000000000000004 in floating point, which would round up to 25. */
export const creditsForCost = (costUsd: number): number =>
  costUsd > 0 ? Math.max(1, Math.ceil(Number((costUsd * TWD_RATE * CREDIT_MARKUP).toFixed(6)))) : 0;

/** Debits the billing account through the 0066 reserve RPC (atomic, idempotent on the key); balance = the wallet after it (unchanged when refused). */
export async function debitCredits(db: SupabaseClient, input: { orgId: string; units: number; idempotencyKey: string; featureKey: string }): Promise<{ ok: boolean; balance: number }> {
  if (!Number.isInteger(input.units) || input.units <= 0) throw new Error("invalid_debit_units");
  const { data, error } = await db.rpc("media_credit_reserve", {
    p_organization_id: input.orgId, p_units: input.units, p_idempotency_key: input.idempotencyKey,
    p_reference_type: "entitlement", p_reference_id: input.featureKey,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: row?.allowed === true, balance: Number(row?.balance ?? 0) };
}

/** Holds a priced call's credits (0148 media_credit_hold): the 0066 debit and a credit_call_holds row in one transaction,
 *  idempotent on the key. balance = the wallet after it (unchanged when refused). */
export async function holdCredits(db: SupabaseClient, input: { orgId: string; units: number; idempotencyKey: string; featureKey: string }): Promise<{ ok: boolean; balance: number }> {
  if (!Number.isInteger(input.units) || input.units <= 0) throw new Error("invalid_hold_units");
  const { data, error } = await db.rpc("media_credit_hold", {
    p_organization_id: input.orgId, p_units: input.units, p_idempotency_key: input.idempotencyKey, p_feature_key: input.featureKey,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: row?.allowed === true, balance: Number(row?.balance ?? 0) };
}

/** Keeps `kept` of a hold and gives the rest back (0148 media_credit_settle_hold); a replay changes nothing. Returns the
 *  units given back -- all of them when the sweep had already closed the hold. */
export async function settleHoldCredits(db: SupabaseClient, input: { idempotencyKey: string; kept: number }): Promise<number> {
  const { data, error } = await db.rpc("media_credit_settle_hold", { p_idempotency_key: input.idempotencyKey, p_kept: input.kept });
  if (error) throw new Error(error.message);
  const back = Number(data);
  if (!Number.isInteger(back) || back < 0) throw new Error("settle_bad_answer");
  return back;
}

/** Holds the app never settled (timeout, restart) go back whole once older than HOLD_EXPIRY (daily sweep). */
export const HOLD_EXPIRY = "2 hours";
export async function expireCreditHolds(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.rpc("media_credit_expire_holds", { p_older_than: HOLD_EXPIRY });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
