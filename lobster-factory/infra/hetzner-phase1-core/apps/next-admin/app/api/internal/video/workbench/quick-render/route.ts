import { NextResponse } from "next/server";
import { workbenchAuthorized } from "@/lib/content/video/workbench-internal";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { runForOrg } from "@/lib/entitlements/grant";
import type { RightsSource } from "@/lib/content/video/asset-origin";
import { ensureWorkbenchProject } from "@/lib/content/video/projects";
import { renderAssetHostError, submitDraftRender } from "@/lib/content/video/draft-render";
import { finalizeVideoJob } from "@/lib/content/video/finalize";
import { readJob } from "@/lib/content/video/job-store";
import { videoObjectKey } from "@/lib/content/blocks/video-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plan U5 快速輸出: the workbench renders one episode ratio on our render service (the staff draft render's code,
 * lib/content/video/draft-render.ts) as a workbench job. Bearer = VW_INTERNAL_TOKEN; unset = every call 401.
 * POST {organizationId, sourceRef, title, ratio, scenes:[{narration, assetId}], tts?:{provider, voice}, intro?:{title,
 * seconds}, autonomy?, userId?} -> 202 {jobId, projectId}. Scenes name registered assets of THIS org only: the url and
 * the rights the render uses are read here, never taken from the caller; another org's id answers 404.
 * GET ?organizationId=&jobId= -> {status: running|error|done}; done = the finished video's main-system row
 * (assetId, checksumSha256, url, ratio, rightsSources). The render's input assets are library assets: nothing is deleted.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF = /^[A-Za-z0-9._:-]{1,200}$/;
const VOICE = /^[A-Za-z0-9:._-]{0,64}$/;
const RATIOS = new Set(["16x9", "9x16", "4x5"]);   // finalize.ts EXPECTED_VIDEO_DIMENSIONS
const MAX_SCENES = 30;                             // video-service RENDER_MAX_SCENES default
const AUTONOMY = new Set(["guided", "auto_after_render"]);
type Body = Record<string, unknown>;
const obj = (v: unknown): Body | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Body : null);

const authorized = workbenchAuthorized;
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

type Parsed = {
  organizationId: string; sourceRef: string; title: string; ratio: string; scenes: { narration: string; assetId: string }[];
  tts: { provider: "edge" | "openai"; voice: string }; intro: { title: string; seconds: number } | null; autonomy: string | null; actor: string;
};
function parse(b: Body | null): Parsed | string {
  if (!b) return "invalid_json";
  const organizationId = typeof b.organizationId === "string" ? b.organizationId : "";
  const sourceRef = typeof b.sourceRef === "string" ? b.sourceRef : "";
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const ratio = typeof b.ratio === "string" ? b.ratio : "";
  if (!UUID.test(organizationId) || !REF.test(sourceRef)) return "organizationId and sourceRef required";
  if (!title || title.length > 180) return "title must be 1-180 characters";
  if (!RATIOS.has(ratio)) return "ratio must be 16x9, 9x16 or 4x5";
  const raw = Array.isArray(b.scenes) ? b.scenes : [];
  if (!raw.length || raw.length > MAX_SCENES) return `scenes must be 1-${MAX_SCENES}`;
  const scenes: Parsed["scenes"] = [];
  for (const s of raw) {
    const o = obj(s), narration = typeof o?.narration === "string" ? o.narration.trim() : "", assetId = typeof o?.assetId === "string" ? o.assetId : "";
    // The engine times a scene by its voice (video-service pipeline.py _audio_duration): a scene without words has no length.
    if (!narration || narration.length > 2000 || !UUID.test(assetId)) return "every scene needs narration (1-2000 characters) and an assetId";
    scenes.push({ narration, assetId });
  }
  const t = b.tts === undefined ? {} : obj(b.tts);
  const provider = t?.provider ?? "edge", voice = t?.voice ?? "";
  if (!t || (provider !== "edge" && provider !== "openai") || typeof voice !== "string" || !VOICE.test(voice)) return "invalid tts";
  let intro: Parsed["intro"] = null;
  if (b.intro !== undefined) {
    const i = obj(b.intro), it = typeof i?.title === "string" ? i.title.trim() : "", sec = Number(i?.seconds);
    if (!it || it.length > 80 || !Number.isFinite(sec) || sec <= 0 || sec > 15) return "intro needs a title (1-80) and 0-15 seconds";
    intro = { title: it, seconds: sec };
  }
  const autonomy = b.autonomy === undefined ? null : String(b.autonomy);
  if (autonomy !== null && !AUTONOMY.has(autonomy)) return "invalid autonomy";
  if (b.userId !== undefined && (typeof b.userId !== "string" || !UUID.test(b.userId))) return "invalid userId";
  return { organizationId, sourceRef, title, ratio, scenes, tts: { provider, voice }, intro, autonomy, actor: "video:" + (b.userId ?? "workbench") };
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return fail(401, "unauthorized");
  const p = parse(obj(await req.json().catch(() => null)));
  if (typeof p === "string") return fail(400, p);
  const db = getSupabaseWriteClient(); if (!db) return fail(503, "db_unavailable");

  // Invariant: a scene's picture is a registered asset of this org; its url and rights come from that row.
  const ids = [...new Set(p.scenes.map((s) => s.assetId))];
  const found = await db.from("media_assets").select("id, object_url, mime_type, metadata").eq("organization_id", p.organizationId).in("id", ids);
  if (found.error) return fail(502, "asset_lookup_failed");
  const byId = new Map((found.data ?? []).map((r) => [String(r.id), r]));
  if (ids.some((id) => !byId.has(id))) return fail(404, "asset not found");
  if (ids.some((id) => !/^(image|video)\//.test(String(byId.get(id)!.mime_type ?? "")))) return fail(400, "a scene asset must be an image or a video");
  const urls = p.scenes.map((s) => String(byId.get(s.assetId)!.object_url ?? ""));
  const hostError = await renderAssetHostError(urls);
  if (hostError) return fail(400, hostError);
  // The video's rights = its pictures' recorded entries (as the workbench's own renders inherit them, main-system.cjs).
  const seen = new Set<string>(), rightsSources: RightsSource[] = [];
  for (const id of ids) {
    const row = byId.get(id)!, stored = (obj(row.metadata)?.rightsSources ?? []) as unknown[];
    for (const e of stored.length ? stored : [{ kind: "unknown", url: String(row.object_url) }]) {
      const key = JSON.stringify(e);
      if (!seen.has(key) && rightsSources.length < 200) { seen.add(key); rightsSources.push(e as RightsSource); }
    }
  }

  const project = await ensureWorkbenchProject(db, p.organizationId, p.sourceRef, p.title, { production_mode: "quick_video" });
  if (project.ok === false) return fail(500, "project_failed");
  const projectId = String(project.item.id);
  const submit = () => submitDraftRender({
    organizationId: p.organizationId,
    scenes: p.scenes.map((s, i) => ({ id: i + 1, narration: s.narration })),
    formatAssets: { [p.ratio]: urls }, formats: [p.ratio],
    title: p.title,
    ttsProvider: p.tts.provider, ttsVoice: p.tts.voice || undefined,
    ...(p.intro ? { introTitle: p.intro.title, introDuration: p.intro.seconds } : {}),
    r2Keys: [],
    rightsSources,
    projectId,
  });
  // Paid narration bills this org (as the staff route's withFeature does); other voices ask nothing.
  const sub = p.tts.provider === "openai" ? await runForOrg(p.organizationId, p.actor, submit) : await submit();
  if (sub.ok === false) return fail(sub.status, sub.error);
  // The project remembers how far it runs on its own (old VideoStudio: written once the render was accepted).
  const { error } = await db.from("media_production_projects").update({
    lifecycle_stage: "produce", updated_at: new Date().toISOString(),
    ...(p.autonomy ? { autonomy: p.autonomy, last_error: null } : {}),
  }).eq("id", projectId).eq("organization_id", p.organizationId);
  if (error) console.warn("[vw-quick-render] project stage update failed:", error.message);
  return NextResponse.json({ ok: true, jobId: sub.jobId, projectId }, { status: 202 });
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return fail(401, "unauthorized");
  const q = new URL(req.url).searchParams, organizationId = q.get("organizationId") ?? "", jobId = q.get("jobId") ?? "";
  if (!UUID.test(organizationId) || !UUID.test(jobId)) return fail(400, "organizationId and jobId required");
  let job;
  try { job = await readJob(jobId); } catch { return fail(502, "job_lookup_failed"); }
  if (!job || job.organizationId !== organizationId) return fail(404, "not found");
  const r = await finalizeVideoJob(job);
  if (r.status === "error") return NextResponse.json({ ok: true, status: "error", error: r.error ?? "render failed" });
  if (r.status !== "done") return NextResponse.json({ ok: true, status: "running" });
  const ratio = job.recordParams?.formats?.[0] ?? "", url = r.video?.outputs?.[ratio];
  const db = getSupabaseWriteClient(); if (!db) return fail(503, "db_unavailable");
  const row = url ? await db.from("media_assets").select("id, checksum_sha256, object_url, metadata")
    .eq("organization_id", organizationId).eq("storage_backend", "r2").eq("object_key", videoObjectKey(url)).eq("version", 1).maybeSingle() : null;
  if (row?.error) return fail(502, "asset_lookup_failed");
  // Recording is best-effort in finalize; the reconcile sweep records a missed row within minutes. Until then: running.
  if (!row?.data) return NextResponse.json({ ok: true, status: "running" });
  return NextResponse.json({
    ok: true, status: "done", ratio, assetId: String(row.data.id), checksumSha256: row.data.checksum_sha256 ?? null,
    url: String(row.data.object_url), rightsSources: obj(row.data.metadata)?.rightsSources ?? [],
  });
}
