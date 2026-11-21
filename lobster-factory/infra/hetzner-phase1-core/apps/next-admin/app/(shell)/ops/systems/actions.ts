"use server";
// The page's only writes: a status_change (system status / priority) or a review (a feature verified or sent back),
// each a new source=user event in system_updates. Owner / admin only (lib/systems/access.ts), checked here on every
// call, not only by hiding the buttons. Answers with ?r=<code> on the system's page.
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestActor } from "@/lib/entitlements/subject";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { systemsAccess } from "@/lib/systems/access";
import { PRIORITIES, projectSystem, SYSTEM_STATUSES } from "@/lib/systems/projection";
import { readDefinitions, readRevertedShas, readStateEvents, writeUserEvent } from "@/lib/systems/store";

const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
};
const REVIEW_VERDICTS = ["verified", "in_progress"] as const;

/** Runs `write` for an owner / admin; returns the code the page shows. */
async function systemsWrite(systemId: string, write: (ctx: { sb: SupabaseClient; actor: string; systemSlug: string; featureSlug: (id: string) => string | null; isLegacy: (id: string) => Promise<boolean> }) => Promise<string>): Promise<string> {
  const access = systemsAccess(await headers());
  if (!access.allowed) return "forbidden";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(systemId)) return "not_found";
  const sb = getSupabaseWriteClient();
  if (!sb) return "db_unavailable";
  try {
    const defs = await readDefinitions(sb, systemId);
    const system = defs.systems[0];
    if (!system) return "not_found";
    return await write({
      sb,
      actor: requestActor(access.req),
      systemSlug: system.slug,
      featureSlug: (id) => defs.features.find((f) => f.id === id)?.slug ?? null,
      // A feature of a phase still on its old supervisor page has its status there (PLAN §8: one source per phase).
      isLegacy: async (id) => {
        const [state, revertedShas] = await Promise.all([readStateEvents(sb, systemId), readRevertedShas(sb)]);
        const p = projectSystem({ phases: defs.phases, features: defs.features, events: state.events, revertedShas });
        return p.features.some((f) => f.feature.id === id && f.legacy);
      },
    });
  } catch (e) {
    console.error(`[systems/actions] ${e instanceof Error ? e.message : String(e)}`);
    return "db_unavailable";
  }
}

async function done(code: string, slug: string, tab: string): Promise<never> {
  revalidatePath("/ops/systems");
  redirect(`/ops/systems/${encodeURIComponent(slug)}?tab=${encodeURIComponent(tab)}&r=${encodeURIComponent(code)}`);
}

export async function setSystemStatus(form: FormData) {
  const systemId = text(form, "system_id");
  const status = text(form, "status");
  const priority = text(form, "priority");
  const code = await systemsWrite(systemId, async ({ sb, actor, systemSlug }) => {
    const payload: Record<string, unknown> = { by: actor };
    if ((SYSTEM_STATUSES as readonly string[]).includes(status)) payload.status = status;
    if ((PRIORITIES as readonly string[]).includes(priority)) payload.priority = priority;
    if (!payload.status && !payload.priority) return "bad_input";
    await writeUserEvent(sb, { systemId, systemSlug, type: "status_change", payload });
    return "saved";
  });
  await done(code, text(form, "slug"), "overview");
}

export async function reviewFeature(form: FormData) {
  const systemId = text(form, "system_id");
  const featureId = text(form, "feature_id");
  const verdict = text(form, "verdict");
  const note = text(form, "note").slice(0, 500);
  const code = await systemsWrite(systemId, async ({ sb, actor, systemSlug, featureSlug, isLegacy }) => {
    const slug = featureSlug(featureId);
    if (!slug) return "not_found";
    if (!(REVIEW_VERDICTS as readonly string[]).includes(verdict)) return "bad_input";
    if (await isLegacy(featureId)) return "legacy_phase";
    await writeUserEvent(sb, {
      systemId, systemSlug, featureId, featureSlug: slug, type: "review",
      payload: { status: verdict, by: actor, ...(note ? { note } : {}) },
    });
    return "saved";
  });
  await done(code, text(form, "slug"), "features");
}
