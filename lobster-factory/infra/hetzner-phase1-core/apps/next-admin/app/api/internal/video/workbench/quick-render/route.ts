import { NextResponse } from "next/server";
import { workbenchAuthorized } from "@/lib/content/video/workbench-internal";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { runForOrg } from "@/lib/entitlements/grant";
import { parseAutoBudget, type AutoBudget } from "@/lib/content/video/auto-run-budget";
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
 * Plan U5.4: intro?/outro? = {kind:"title", title, seconds} | {kind:"template", assetId} (a rendered template video of
 * THIS org, checked like the scenes), transition? none|crossfade|fade-black, transitionSeconds? 0.2-2 -> joined into the
 * one video by the service. An intro without kind = the old title card (intro_title), unchanged.
 * Plan U5.3: embedSiteId? (with autonomy auto_after_render only) = after the schedule's social drafts, a new WordPress
 * draft on this org's site with the video embedded (project-advance-deps drafts). autonomy never takes full_auto: a
 * button a person presses goes at most to drafts (plan §12, §13 C3).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF = /^[A-Za-z0-9._:-]{1,200}$/;
const VOICE = /^[A-Za-z0-9:._-]{0,64}$/;
const RATIOS = new Set(["16x9", "9x16", "4x5"]);   // finalize.ts EXPECTED_VIDEO_DIMENSIONS
const MAX_SCENES = 30;                             // video-service RENDER_MAX_SCENES default
const AUTONOMY = new Set(["guided", "auto_after_render"]);
const TRANSITIONS = new Set(["none", "crossfade", "fade-black"]);
type Body = Record<string, unknown>;
const obj = (v: unknown): Body | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Body : null);

const authorized = workbenchAuthorized;
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

type Bookend = { kind: "title"; title: string; seconds: number } | { kind: "template"; assetId: string };
type Parsed = {
  organizationId: string; sourceRef: string; title: string; ratio: string; scenes: { narration: string; assetId: string }[];
  tts: { provider: "edge" | "openai"; voice: string }; intro: { title: string; seconds: number } | null; autonomy: string | null; actor: string;
  bookends: { intro: Bookend | null; outro: Bookend | null; transition: "none" | "crossfade" | "fade-black"; transitionSeconds: number } | null;
  embedSiteId: string | null;
  autoBudget: AutoBudget | null;
};
function bookend(v: unknown): Bookend | string {
  const o = obj(v);
  if (o?.kind === "template") return typeof o.assetId === "string" && UUID.test(o.assetId) ? { kind: "template", assetId: o.assetId } : "a template bookend needs an assetId";
  const t = typeof o?.title === "string" ? o.title.trim() : "", sec = Number(o?.seconds);
  if (o?.kind !== "title" || !t || t.length > 80 || !Number.isFinite(sec) || sec <= 0 || sec > 15) return "a title bookend needs a title (1-80) and 0-15 seconds";
  return { kind: "title", title: t, seconds: sec };
}
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
  let intro: Parsed["intro"] = null, bookends: Parsed["bookends"] = null;
  if (obj(b.intro)?.kind !== undefined || b.outro !== undefined) {
    const i = b.intro === undefined ? null : bookend(b.intro), o = b.outro === undefined ? null : bookend(b.outro);
    if (typeof i === "string") return i;
    if (typeof o === "string") return o;
    const transition = b.transition ?? "none", ts = b.transitionSeconds === undefined ? 0.5 : Number(b.transitionSeconds);
    if (typeof transition !== "string" || !TRANSITIONS.has(transition)) return "invalid transition";
    if (transition !== "none" && !(ts >= 0.2 && ts <= 2)) return "transitionSeconds must be 0.2-2";
    bookends = { intro: i, outro: o, transition: transition as "none" | "crossfade" | "fade-black", transitionSeconds: ts };
  } else if (b.intro !== undefined) {
    const i = obj(b.intro), it = typeof i?.title === "string" ? i.title.trim() : "", sec = Number(i?.seconds);
    if (!it || it.length > 80 || !Number.isFinite(sec) || sec <= 0 || sec > 15) return "intro needs a title (1-80) and 0-15 seconds";
    intro = { title: it, seconds: sec };
  }
  const autonomy = b.autonomy === undefined ? null : String(b.autonomy);
  if (autonomy !== null && !AUTONOMY.has(autonomy)) return "invalid autonomy";
  const embedSiteId = b.embedSiteId === undefined || b.embedSiteId === null ? null : String(b.embedSiteId);
  if (embedSiteId !== null && (!UUID.test(embedSiteId) || autonomy !== "auto_after_render")) return "embedSiteId needs a site id and autonomy auto_after_render";
  if (b.userId !== undefined && (typeof b.userId !== "string" || !UUID.test(b.userId))) return "invalid userId";
  const autoBudget = b.autoBudget === undefined ? null : parseAutoBudget(b.autoBudget);
  if (b.autoBudget !== undefined && !autoBudget) return "invalid autoBudget";
  return { organizationId, sourceRef, title, ratio, scenes, tts: { provider, voice }, intro, autonomy, actor: "video:" + (b.userId ?? "workbench"), bookends, embedSiteId, autoBudget };
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return fail(401, "unauthorized");
  const p = parse(obj(await req.json().catch(() => null)));
  if (typeof p === "string") return fail(400, p);
  const db = getSupabaseWriteClient(); if (!db) return fail(503, "db_unavailable");

  // Invariant: a scene's picture and a template bookend are registered assets of this org; url and rights come from the row.
  const ends = [p.bookends?.intro, p.bookends?.outro].flatMap((e) => (e?.kind === "template" ? [e.assetId] : []));
  const ids = [...new Set([...p.scenes.map((s) => s.assetId), ...ends])];
  const found = await db.from("media_assets").select("id, object_url, mime_type, metadata").eq("organization_id", p.organizationId).in("id", ids);
  if (found.error) return fail(502, "asset_lookup_failed");
  const byId = new Map((found.data ?? []).map((r) => [String(r.id), r]));
  if (ids.some((id) => !byId.has(id))) return fail(404, "asset not found");
  if (ids.some((id) => !/^(image|video)\//.test(String(byId.get(id)!.mime_type ?? "")))) return fail(400, "a scene asset must be an image or a video");
  if (ends.some((id) => !String(byId.get(id)!.mime_type ?? "").startsWith("video/"))) return fail(400, "a template bookend must be a video");
  const urls = p.scenes.map((s) => String(byId.get(s.assetId)!.object_url ?? ""));
  const urlOf = (id: string) => String(byId.get(id)!.object_url ?? "");
  const hostError = await renderAssetHostError([...urls, ...ends.map(urlOf)]);
  if (hostError) return fail(400, hostError);
  // The video's rights = its pictures' recorded entries (as the workbench's own renders inherit them, main-system.cjs).
  const seen = new Set<string>(), rightsSources: RightsSource[] = []; // a template bookend's rights are the video's too
  for (const id of ids) {
    const row = byId.get(id)!, stored = (obj(row.metadata)?.rightsSources ?? []) as unknown[];
    for (const e of stored.length ? stored : [{ kind: "unknown", url: String(row.object_url) }]) {
      const key = JSON.stringify(e);
      if (!seen.has(key) && rightsSources.length < 200) { seen.add(key); rightsSources.push(e as RightsSource); }
    }
  }

  if (p.embedSiteId) {
    const site = await db.from("wp_sites").select("id").eq("id", p.embedSiteId).eq("organization_id", p.organizationId).maybeSingle();
    if (site.error) return fail(502, "site_lookup_failed");
    if (!site.data) return fail(404, "site not found");
  }
  const seg = (e: Bookend | null) => (!e ? undefined : e.kind === "title" ? { title: e.title, duration: e.seconds } : { assetUrl: urlOf(e.assetId) });

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
    ...(p.bookends ? { bookends: { intro: seg(p.bookends.intro), outro: seg(p.bookends.outro), transition: p.bookends.transition, transitionSeconds: p.bookends.transitionSeconds } } : {}),
    r2Keys: [],
    rightsSources,
    projectId,
    ...(p.autoBudget ? { autoRunId: p.autoBudget.runId } : {}),
  });
  // Paid narration bills this org (as the staff route's withFeature does); other voices ask nothing.
  const sub = p.tts.provider === "openai" ? await runForOrg(p.organizationId, p.actor, submit) : await submit();
  if (sub.ok === false) return fail(sub.status, sub.error);
  // The project remembers how far it runs on its own (old VideoStudio: written once the render was accepted), and whether
  // the schedule also embeds the video in a new WordPress draft (brief_json.autoEmbed, read by project-advance-deps).
  let brief: Record<string, unknown> | null = null;
  if (p.autonomy) {
    const r = await db.from("media_production_projects").select("brief_json").eq("id", projectId).eq("organization_id", p.organizationId).maybeSingle();
    const oldBrief = (obj(r.data?.brief_json) ?? {}) as Record<string, unknown>;
    const sameRun = p.autoBudget && obj(oldBrief.autoBudget)?.runId === p.autoBudget.runId;
    const { autoEmbed: _old, ...rest } = oldBrief;
    void _old;
    if (p.autoBudget && !sameRun) { delete rest.autoDrafts; delete rest.autoEmbedded; }
    if (p.autoBudget) rest.autoBudget = { ...p.autoBudget, startedAt: sameRun ? obj(oldBrief.autoBudget)?.startedAt : new Date().toISOString(), spentTwd: sameRun ? Math.max(p.autoBudget.spentTwd, Number(obj(oldBrief.autoBudget)?.spentTwd) || 0) : p.autoBudget.spentTwd };
    brief = p.embedSiteId ? { ...rest, autoEmbed: { siteId: p.embedSiteId } } : rest;
  }
  const { error } = await db.from("media_production_projects").update({
    lifecycle_stage: "produce", updated_at: new Date().toISOString(),
    ...(p.autonomy ? { autonomy: p.autonomy, last_error: null, brief_json: brief } : {}),
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
