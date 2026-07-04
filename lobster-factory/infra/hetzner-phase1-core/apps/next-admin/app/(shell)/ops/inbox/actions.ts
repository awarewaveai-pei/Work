"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canModifyIncidentStatus, readOpsRole } from "@/lib/ops-role";

async function readRoleFromHeaders() {
  const h = await headers();
  const req = new Request("http://localhost", { headers: h });
  return readOpsRole(req);
}

async function ensureRole(): Promise<string> {
  const role = await readRoleFromHeaders();
  if (!canModifyIncidentStatus(role)) throw new Error("forbidden");
  return role;
}

export async function acknowledgeIncident(id: string) {
  await ensureRole();
  const supabase = getSupabaseWriteClient();
  if (!supabase) throw new Error("db");
  await supabase.from("ops_incidents").update({ status: "investigating" }).eq("id", id);
  revalidatePath(`/ops/inbox/${id}`);
  revalidatePath("/ops/inbox");
}

export async function resolveIncident(id: string) {
  const role = await ensureRole();
  const supabase = getSupabaseWriteClient();
  if (!supabase) throw new Error("db");
  await supabase
    .from("ops_incidents")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: role,
    })
    .eq("id", id);
  revalidatePath(`/ops/inbox/${id}`);
  revalidatePath("/ops/inbox");
}

export async function ignoreIncident(id: string) {
  await ensureRole();
  const supabase = getSupabaseWriteClient();
  if (!supabase) throw new Error("db");
  await supabase.from("ops_incidents").update({ status: "ignored" }).eq("id", id);
  revalidatePath(`/ops/inbox/${id}`);
  revalidatePath("/ops/inbox");
}

export async function reopenIncident(id: string) {
  await ensureRole();
  const supabase = getSupabaseWriteClient();
  if (!supabase) throw new Error("db");
  const { data: cur } = await supabase.from("ops_incidents").select("reopen_count").eq("id", id).single();
  await supabase
    .from("ops_incidents")
    .update({
      status: "open",
      reopen_count: ((cur as any)?.reopen_count ?? 0) + 1,
      resolved_at: null,
      resolved_by: null,
    })
    .eq("id", id);
  revalidatePath(`/ops/inbox/${id}`);
  revalidatePath("/ops/inbox");
}
