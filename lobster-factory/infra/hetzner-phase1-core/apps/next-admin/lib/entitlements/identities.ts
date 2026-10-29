import type { SupabaseClient } from "@supabase/supabase-js";

/** A member of one cash-register site (0133: an outside id is unique only within its site). provider follows the
 *  site: aware-wave.com = awarewave-wp, every other site = customer-wp (lib/payments/sites.ts siteIdentityProvider). */
export interface Identity {
  provider: "awarewave-wp" | "customer-wp";
  siteId: string;
  externalId: string;
}

export interface BillingAccountIdentity {
  organizationId: string;
  userId: string;
}

type IdentityRow = {
  external_id: string;
  organization_id: string;
  user_id: string;
};

function account(row: IdentityRow): BillingAccountIdentity {
  return { organizationId: row.organization_id, userId: row.user_id };
}

export async function findBillingAccount(
  db: SupabaseClient,
  id: Identity,
): Promise<BillingAccountIdentity | null> {
  const { data, error } = await db
    .from("customer_identities")
    .select("external_id, organization_id, user_id")
    .eq("provider", id.provider)
    .eq("site_id", id.siteId)
    .eq("external_id", id.externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? account(data as IdentityRow) : null;
}

async function findExistingIdentity(
  db: SupabaseClient,
  input: Identity & { userId: string; organizationId: string },
): Promise<IdentityRow | null> {
  const byExternalId = await db
    .from("customer_identities")
    .select("external_id, organization_id, user_id")
    .eq("site_id", input.siteId)
    .eq("external_id", input.externalId)
    .maybeSingle();
  if (byExternalId.error) throw new Error(byExternalId.error.message);
  if (byExternalId.data) return byExternalId.data as IdentityRow;

  const byUserId = await db
    .from("customer_identities")
    .select("external_id, organization_id, user_id")
    .eq("site_id", input.siteId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (byUserId.error) throw new Error(byUserId.error.message);
  return byUserId.data ? byUserId.data as IdentityRow : null;
}

export async function linkIdentity(
  db: SupabaseClient,
  input: Identity & { userId: string; organizationId: string },
): Promise<BillingAccountIdentity & { created: boolean }> {
  const { data, error } = await db
    .from("customer_identities")
    .insert({
      provider: input.provider,
      site_id: input.siteId,
      external_id: input.externalId,
      user_id: input.userId,
      organization_id: input.organizationId,
    })
    .select("external_id, organization_id, user_id")
    .single();

  if (!error && data) return { ...account(data as IdentityRow), created: true };
  if (error?.code !== "23505") {
    throw new Error(`linkIdentity insert failed: ${error?.message ?? "no row returned"}`);
  }

  const existing = await findExistingIdentity(db, input);
  if (!existing
      || existing.external_id !== input.externalId
      || existing.user_id !== input.userId
      || existing.organization_id !== input.organizationId) {
    throw new Error("identity_conflict");
  }
  return { ...account(existing), created: false };
}
