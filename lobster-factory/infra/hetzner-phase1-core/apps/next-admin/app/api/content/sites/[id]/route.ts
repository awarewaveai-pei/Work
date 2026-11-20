import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { siteRowGate, siteUrlWriteGate } from "@/lib/content/wp-sites";
import { staffOnly } from "@/lib/tenant-guard";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { MAX_REQUIRED_BLOCKS, MAX_REQUIRED_BLOCK_CHARS, MAX_TREND_FEEDS, PUBLISH_MODES, TOPIC_MODES, YOUTUBE_PRIVACIES, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { isSafePublicHttps } from "@/lib/content/public-https";
import { autoIntroStyles } from "@/public/editor-shared/intro-styles.js";
import Transitions from "@/public/editor-shared/transitions.js";

// youtubePrivacy (N5a): who sees the auto-made videos -- outward like the two modes, so set the same way
const GATE_MODES = [
  { field: "publishMode", allowed: PUBLISH_MODES },
  { field: "topicMode", allowed: TOPIC_MODES },
  { field: "dailyTrendTopics", allowed: [true, false] },   // N8: the schedule scores and proposes trend topics each day
  { field: "youtubePrivacy", allowed: YOUTUBE_PRIVACIES },
] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/content/sites/[id] — update site (token optional)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const denied = await siteRowGate(req, id);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name   === "string")  patch.name   = body.name.trim();
  if (typeof body.url    === "string") {
    // The edit form always sends url; only a changed one goes through the staff-only gate.
    const url = body.url.trim().replace(/\/$/, "");
    const { data: current, error: readError } = await supabase.from("wp_sites").select("url").eq("id", id).maybeSingle();
    if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
    if (url !== (current as { url: string } | null)?.url.replace(/\/$/, "")) {
      const urlDenied = siteUrlWriteGate(req, url);
      if (urlDenied) return urlDenied;
      patch.url = url;
    }
  }
  if (typeof body.color  === "string")  patch.color  = body.color.trim();
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.note     === "string")  patch.note     = body.note.trim() || null;
  if (typeof body.username === "string" && body.username.trim()) patch.username = body.username.trim();
  // Token/AppPassword only updated when explicitly provided and non-empty
  if (typeof body.token    === "string" && body.token.trim()) patch.token = body.token.trim();
  // Content Studio per-site defaults (full replace -- caller sends complete object), except the gate modes: each is set
  // only by its own field, staff only (publishMode sends to the customer's site and social channels without a person;
  // topicMode and dailyTrendTopics spend the customer's money without one), and the write is conditional on the modes read here -- a save
  // racing a mode switch gets 409 instead of undoing it. The gates are independent (B4): switching one never moves the other.
  const defaultsGiven = typeof body.contentDefaults === "object" && body.contentDefaults !== null && !Array.isArray(body.contentDefaults);
  for (const g of GATE_MODES) {
    if (body[g.field] === undefined) continue;
    const modeDenied = staffOnly(req);
    if (modeDenied) return modeDenied;
    if (!(g.allowed as readonly unknown[]).includes(body[g.field]))
      return NextResponse.json({ ok: false, error: `${g.field} must be one of ${g.allowed.join(", ")}` }, { status: 400 });
  }
  // Card R2: the automatic videos' intro styles -- its own field (a whole-defaults save keeps the stored list, as with the
  // modes); automatic style ids only, each once; [] = no intro. Not a gate: it neither spends nor sends anything.
  const introGiven = body.introStyles !== undefined;
  if (introGiven && (!Array.isArray(body.introStyles) || autoIntroStyles(body.introStyles).length !== body.introStyles.length))
    return NextResponse.json({ ok: false, error: "introStyles: 只能是可自動加的片頭樣式，每個一次" }, { status: 400 });
  // The intro's transition: its own field too; one of the transitions module's choices, stored by its name.
  const transitionGiven = body.introTransition !== undefined;
  if (transitionGiven && (typeof body.introTransition !== "string" || !Transitions.LIST.some((t: { id: string }) => t.id === body.introTransition)))
    return NextResponse.json({ ok: false, error: "introTransition: 不是轉場清單裡的名字" }, { status: 400 });
  let modesRead: Array<[string, string | null]> | undefined;   // undefined = content_defaults not written
  if (defaultsGiven || introGiven || transitionGiven || GATE_MODES.some((g) => body[g.field] !== undefined)) {
    const { data: current, error: readError } = await supabase.from("wp_sites").select("content_defaults").eq("id", id).maybeSingle();
    if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
    const stored = ((current as { content_defaults: SiteContentDefaults | null } | null)?.content_defaults) ?? {};
    const next: Record<string, unknown> = { ...((defaultsGiven ? body.contentDefaults : stored) as SiteContentDefaults) };
    if (defaultsGiven && "trendFeeds" in next) {
      if (!Array.isArray(next.trendFeeds)) delete next.trendFeeds;
      else {
        const feeds = [...new Set(next.trendFeeds.map((u) => (typeof u === "string" ? u.trim() : "")).filter(Boolean))];
        const bad = feeds.find((u) => !isSafePublicHttps(u));
        if (bad) return NextResponse.json({ ok: false, error: `trendFeeds: ${bad} 不是公開 https 網址` }, { status: 400 });
        if (feeds.length > MAX_TREND_FEEDS) return NextResponse.json({ ok: false, error: `trendFeeds: 最多 ${MAX_TREND_FEEDS} 個` }, { status: 400 });
        next.trendFeeds = feeds;
      }
    }
    if (defaultsGiven && "requiredBlocks" in next) {
      if (!Array.isArray(next.requiredBlocks)) delete next.requiredBlocks;
      else {
        const blocks = [...new Set(next.requiredBlocks.map((b) => (typeof b === "string" ? b.trim() : "")).filter(Boolean))];
        if (blocks.length > MAX_REQUIRED_BLOCKS) return NextResponse.json({ ok: false, error: `每篇必附段落最多 ${MAX_REQUIRED_BLOCKS} 段` }, { status: 400 });
        const long = blocks.find((b) => b.length > MAX_REQUIRED_BLOCK_CHARS);
        if (long) return NextResponse.json({ ok: false, error: `每篇必附段落每段最多 ${MAX_REQUIRED_BLOCK_CHARS} 字：「${long.slice(0, 20)}…」太長` }, { status: 400 });
        next.requiredBlocks = blocks;
      }
    }
    const intro = autoIntroStyles(introGiven ? body.introStyles : (stored as SiteContentDefaults).introStyles);
    delete next.introStyles;
    if (intro.length) next.introStyles = intro;
    const rawTransition = (stored as Record<string, unknown>).introTransition;
    delete next.introTransition;
    const transition = transitionGiven ? body.introTransition : rawTransition;
    if (typeof transition === "string") next.introTransition = transition;
    modesRead = [];
    for (const g of GATE_MODES) {
      delete next[g.field];
      const mode = body[g.field] ?? (stored as Record<string, unknown>)[g.field];
      if (mode) next[g.field] = mode;
      // as `content_defaults->>field` renders it, so even a malformed stored value (true, 1) can be overwritten
      const raw = (stored as Record<string, unknown>)[g.field];
      modesRead.push([g.field, raw === undefined || raw === null ? null : typeof raw === "string" ? raw : JSON.stringify(raw)]);
    }
    // R2 (Codex daa15da9): the write is also conditional on the intro list read here, so a whole-defaults save racing an
    // intro save gets 409 instead of writing the old list back. Compared as `content_defaults->>introStyles` renders a
    // jsonb array of strings (", " between items); a hand-made non-list value is not compared (it reads as no intro).
    const rawIntro = (stored as Record<string, unknown>).introStyles;
    if (rawIntro === undefined || rawIntro === null) modesRead.push(["introStyles", null]);
    else if (Array.isArray(rawIntro) && rawIntro.every((x) => typeof x === "string"))
      modesRead.push(["introStyles", "[" + rawIntro.map((x) => JSON.stringify(x)).join(", ") + "]"]);
    // the same for the transition (a string renders as itself)
    if (rawTransition === undefined || rawTransition === null) modesRead.push(["introTransition", null]);
    else if (typeof rawTransition === "string") modesRead.push(["introTransition", rawTransition]);
    patch.content_defaults = next;
  }

  let update = supabase.from("wp_sites").update(patch).eq("id", id);
  for (const [field, read] of modesRead ?? []) {
    update = read === null ? update.is(`content_defaults->>${field}`, null) : update.eq(`content_defaults->>${field}`, read);
  }
  const { data, error } = await update
    .select("id, name, url, color, active, note, created_at, token, username, content_defaults")
    .single();

  if (error) {
    if (error.code === "PGRST116" && modesRead !== undefined) {
      return NextResponse.json({ ok: false, error: "網站設定剛被別人改過，請重新整理後再存一次" }, { status: 409 });
    }
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }

  const row = data as { id: string; name: string; url: string; color: string; active: boolean; note: string | null; created_at: string; token: string; username: string; content_defaults: SiteContentDefaults | null };
  const site: ManagedSite = {
    id: row.id,
    name: row.name,
    url: row.url,
    color: row.color,
    active: row.active,
    tokenSet: Boolean(row.token),
    usernameSet: Boolean(row.username),
    note: row.note,
    source: "db",
    createdAt: row.created_at,
    contentDefaults: row.content_defaults ?? {},
  };
  return NextResponse.json({ ok: true, site });
}

// DELETE /api/content/sites/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const denied = await siteRowGate(req, id);
  if (denied) return denied;

  const { error } = await supabase
    .from("wp_sites")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
