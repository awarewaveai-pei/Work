import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { PRODUCTS } from "@/lib/portal/products";

/** Who operates a product for an account (ADR 017 §0 operation axis, ADR 021 §2 代操; migration 0178). No row =
 *  "customer"; staff switch a product to "awarewave" on the client hub (帳務). Always the billing (root) account: 0178
 *  refuses a brand or an internal account. Reselling is not here (a live <product>.resell row), nor buyout. */
export const OPERATORS = ["customer", "awarewave"] as const;
export type Operator = typeof OPERATORS[number];
export const isOperator = (v: unknown): v is Operator => typeof v === "string" && (OPERATORS as readonly string[]).includes(v);

export interface ProductOperation { key: string; name: string; operatedBy: Operator; updatedAt: string | null; updatedBy: string | null }
/** The client hub's 誰在操作 card (OperationsCard.tsx): products null when the read failed (error says why). */
export type OperationsData = { products: ProductOperation[] | null; error: string | null; canEdit: boolean };

type Row = { product_key: string; operated_by: string; updated_at: string; updated_by: string };

/** Pure: the account's rows -> one line per registered product, "customer" where there is no row. A row whose product
 *  the registry no longer has (withdrawn) is skipped: 0178 keeps no product list, the registry is the only one. */
export function summarizeOperations(rows: Row[], products: typeof PRODUCTS = PRODUCTS): ProductOperation[] {
  return products.map((p) => {
    const r = rows.find((x) => x.product_key === p.key);
    return { key: p.key, name: p.name, operatedBy: r && isOperator(r.operated_by) ? r.operated_by : "customer",
      updatedAt: r?.updated_at ?? null, updatedBy: r?.updated_by ?? null };
  });
}

export async function productOperations(accountId: string, client: SupabaseClient | null = getSupabaseWriteClient()): Promise<ProductOperation[]> {
  if (!client) throw new Error("entitlements_db_unavailable");
  const { data, error } = await client.from("organization_product_operations")
    .select("product_key, operated_by, updated_at, updated_by").eq("organization_id", accountId);
  if (error) throw new Error(error.message);
  return summarizeOperations((data ?? []) as Row[]);
}

/** set / unknown_product (not in lib/portal/products.ts -- the only product check, 0178 has none), or a refusal from 0178 (operation:<code>). Switching back to "customer" keeps the row (who
 *  switched it last, and when); reading it is the same as no row. */
export async function setProductOperator(
  change: { accountId: string; productKey: string; operatedBy: Operator; actor: string },
  client: SupabaseClient | null = getSupabaseWriteClient(),
): Promise<"set" | string> {
  if (!client) throw new Error("entitlements_db_unavailable");
  if (!PRODUCTS.some((p) => p.key === change.productKey)) return "unknown_product";
  const { error } = await client.from("organization_product_operations").upsert({
    organization_id: change.accountId, product_key: change.productKey, operated_by: change.operatedBy,
    updated_at: new Date().toISOString(), updated_by: change.actor,
  }, { onConflict: "organization_id,product_key" });
  if (error) {
    const code = /operation:([a-z_]+)/.exec(error.message)?.[1];
    if (code) return code;
    throw new Error(error.message);
  }
  return "set";
}
