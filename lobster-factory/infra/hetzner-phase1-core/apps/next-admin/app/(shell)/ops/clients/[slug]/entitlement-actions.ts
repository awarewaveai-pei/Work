"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { staffGrantOutcome, text } from "./staff-grant-outcome";

export async function saveStaffGrants(form: FormData) {
  const slug = text(form, "slug");
  const q = await staffGrantOutcome(form, await headers());
  q.set("tab", "帳務");
  revalidatePath(`/ops/clients/${slug}`);
  redirect(`/ops/clients/${encodeURIComponent(slug)}?${q.toString()}`);
}
