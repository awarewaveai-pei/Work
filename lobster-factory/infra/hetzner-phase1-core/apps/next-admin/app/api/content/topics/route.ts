// /api/content/topics -- a site's topic queue (migration 0121; lib/content/topics/store.ts).
//   GET  ?siteId&month=YYYY-MM[&folders=1]  the site's organization's topics of that month (+ its knowledge-base folders,
//                                         offered as topic sources on the page)
//   POST { siteId, month, title, keyword, angle?, day?, hour?, formats?, source?: "manual"|"kb", sourceRef? }  one proposed
//        topic; day and hour are Taipei time (hour default 9)
//   GET also answers dailyCap: how many topics the brand may start a day (its content_pipeline limit on /ops/schedules)
// The site decides the organization; the caller must be allowed on it (canAccessOrg), or the answer is 404.
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { canAccessOrg } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { requestActor } from "@/lib/entitlements/subject";
import { loadSiteBrand } from "@/lib/content/brand-voice-store";
import { listFolders } from "@/lib/kb/folders";
import { daysIn, fromTaipei, isMonth, listTopics, monthKey, proposeTopics, TOPIC_FORMATS, type TopicFormat } from "@/lib/content/topics/store";
import { DAILY_START_CAP } from "@/lib/content/topics/tick";
import { storedDailyLimit } from "@/lib/schedules/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The site's organization when the caller may act on it; otherwise the response to return. */
async function siteOrg(req: Request, siteId: string) {
  const sb = getSupabaseWriteClient();
  if (!sb) return { res: NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 }) } as const;
  const site = siteId ? await loadSiteBrand(sb, siteId) : null;
  if (!site?.organizationId || !canAccessOrg(req, site.organizationId)) {
    return { res: NextResponse.json({ ok: false, error: "site not found" }, { status: 404 }) } as const;
  }
  return { sb, org: site.organizationId } as const;
}

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  const q = new URL(req.url).searchParams;
  const month = q.get("month") ?? "";
  if (!isMonth(month)) return NextResponse.json({ ok: false, error: "month must be YYYY-MM" }, { status: 400 });
  try {
    const s = await siteOrg(req, (q.get("siteId") ?? "").trim());
    if ("res" in s) return s.res;
    const [topics, folders, cap] = await Promise.all([listTopics(s.sb, s.org, month), q.get("folders") === "1" ? listFolders(s.org) : Promise.resolve([]),
      storedDailyLimit(s.org, "content_pipeline")]);
    return NextResponse.json({ ok: true, topics, folders: folders.map((f) => ({ id: f.id, name: f.name })), dailyCap: cap ?? DAILY_START_CAP });
  } catch (e) {
    console.error("[content/topics] list failed:", e);
    return NextResponse.json({ ok: false, error: "topics could not be read" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const month = str(b.month, 7);
  const title = str(b.title, 300);
  const keyword = str(b.keyword, 200);
  if (!isMonth(month) || !title || !keyword) return NextResponse.json({ ok: false, error: "month (YYYY-MM), title and keyword required" }, { status: 400 });
  const day = Math.min(daysIn(month), Math.max(1, Math.round(Number(b.day) || 1)));
  const hour = b.hour === undefined ? 9 : Math.min(23, Math.max(0, Math.round(Number(b.hour) || 0)));
  const formats = Array.isArray(b.formats) ? [...new Set(b.formats.filter((f): f is TopicFormat => (TOPIC_FORMATS as readonly string[]).includes(f as string)))] : [];
  const source = b.source === "kb" ? "kb" : "manual";
  const sourceRef = b.sourceRef && typeof b.sourceRef === "object" && !Array.isArray(b.sourceRef) ? b.sourceRef as Record<string, unknown> : {};
  try {
    const s = await siteOrg(req, str(b.siteId, 64));
    if ("res" in s) return s.res;
    const added = await proposeTopics(s.sb, [{
      organization_id: s.org, site_id: str(b.siteId, 64), title, keyword, angle: str(b.angle, 1000) || null,
      source, source_ref: sourceRef, month: monthKey(month), scheduled_for: fromTaipei(month, day, hour),
      formats: formats.length ? formats : ["article", "social"], created_by: requestActor(req),
    }]);
    if (!added.length) return NextResponse.json({ ok: false, error: "this keyword is already planned for that month" }, { status: 409 });
    return NextResponse.json({ ok: true, topic: added[0] });
  } catch (e) {
    console.error("[content/topics] add failed:", e);
    return NextResponse.json({ ok: false, error: "topic could not be saved" }, { status: 500 });
  }
}
