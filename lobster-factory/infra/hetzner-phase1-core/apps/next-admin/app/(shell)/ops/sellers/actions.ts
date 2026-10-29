"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canWriteTenantConfig, readOpsRole } from "@/lib/ops-role";
import { registerSite, setSiteStatus } from "@/lib/payments/sites";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Registering or closing a cash register decides whose payment events the control plane believes: owner or admin only. */
async function outcome(run: (db: NonNullable<ReturnType<typeof getSupabaseWriteClient>>) => Promise<string>): Promise<string> {
  const role = readOpsRole(new Request("http://localhost", { headers: await headers() }));
  if (!canWriteTenantConfig(role)) return "forbidden";
  const db = getSupabaseWriteClient();
  if (!db) return "db_unavailable";
  return run(db);
}

const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

export async function addSite(form: FormData) {
  const code = await outcome(async (db) => {
    const sellerId = text(form, "seller").trim();
    if (UUID.test(sellerId)) {
      const { data, error } = await db.from("organizations").select("id").eq("id", sellerId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return "seller_not_found";
    }
    const result = await registerSite(db, {
      host: text(form, "host"), keyId: text(form, "key_id").trim(), sellerOrganizationId: sellerId,
      publicKey: text(form, "public_key"), handoffPublicKey: text(form, "handoff_public_key"),
    });
    return "error" in result ? result.error : "added";
  });
  revalidatePath("/ops/sellers");
  redirect(`/ops/sellers?r=${encodeURIComponent(code)}`);
}

export async function changeSiteStatus(form: FormData) {
  const status = text(form, "status");
  const code = await outcome(async (db) => {
    if (status !== "active" && status !== "disabled") return "invalid_site";
    return (await setSiteStatus(db, text(form, "site"), status)) ? (status === "active" ? "enabled" : "disabled") : "invalid_site";
  });
  revalidatePath("/ops/sellers");
  redirect(`/ops/sellers?r=${encodeURIComponent(code)}`);
}
