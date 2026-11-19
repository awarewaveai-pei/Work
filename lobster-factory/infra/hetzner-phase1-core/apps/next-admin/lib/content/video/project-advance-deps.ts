/** The real dependencies of advanceProject (project-advance.ts) for one organization: the video job store, QA, Release and social stores. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { QA_LABELS, explainFinding } from "@/app/(shell)/tools/video/qa-labels";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import { renderSiteVoice, siteLanguage, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { addVideo, getPost, listAccounts, savePost } from "@/lib/social/store";
import { textsForAccounts, writerKeysFor, writeSocialPosts } from "@/lib/social/write-posts";
import { claudeWriter } from "@/lib/social/write-posts-claude";
import { persistEditorialRightsQa } from "./editorial-rights-persist";
import { finalizeVideoJob } from "./finalize";
import { readJob } from "./job-store";
import { FINISHED_VIDEO_MIME, updateProjectRow } from "./projects";
import type { AdvanceDeps, AdvanceProject, RatioRow } from "./project-advance";
import { RunChanged, WAIT_LIMIT_MS } from "./project-advance";
import { embedVideoInNewDraft } from "./embed-in-post";
import { orgIdentity } from "@/lib/tenant-guard";
import { parseAutoBudget, reserveDraftCall } from "./auto-run-budget";
import { usdToNtd } from "@/lib/ai/cost-calculator";
import { buildOperatorTelegramNotifier } from "@/lib/ops-inbox/notify/telegram";
import { productHost } from "@/lib/portal/hosts";
import { PRODUCTS } from "@/lib/portal/products";
import { REQUIRED_RELEASE_QA_KINDS, loadAuthoritativeReleaseEvidence } from "./release-evidence";
import { createApprovedRelease } from "./release-create";
import { summarizeQaFindings } from "./qa-findings-summary";
import { saveVideoSocialDrafts } from "./social-drafts";
import { draftDeps } from "./social-drafts-deps";
import { loadVideoRows, newestPerRatio, projectVideoRows } from "./ratio-rows";
import { createdSince, rerenderSince } from "./rerender-mark";
import { keptNote, postsToRefresh, refreshDrafts, type DraftPost } from "./draft-refresh";

const fail = (what: string, e: { message: string }): never => { throw new Error(`${what}: ${e.message}`); };
type Row = Record<string, unknown>;

// A firing works for the run in brief_json.autoBudget when it read the row (runId; undefined = a run without a budget).
// Checked on a fresh row: a newer run ends this firing quietly (RunChanged), and right before anything is paid or sent out
// so does a person's stop (autonomy back to guided). A write that only records what already happened checks the run only.
function assertRun(row: Row, runId: string | undefined, beforeSpending: boolean) {
  if (runId !== undefined && (row.brief_json as { autoBudget?: { runId?: unknown } } | null)?.autoBudget?.runId !== runId) throw new RunChanged("一鍵執行已被更新，停止舊執行");
  if (beforeSpending && row.autonomy !== "auto_after_render") throw new RunChanged("一鍵執行已停止");
}

export function advanceDeps(sb: SupabaseClient, org: string, actor: string): AdvanceDeps {
  // Every brief_json write merges on a fresh read (updateProjectRow): a stop, a new run or another render's write that
  // landed meanwhile is kept instead of being erased by this firing's older copy.
  async function patchBrief(projectId: string, change: (brief: Row, row: Row) => Row) {
    const r = await updateProjectRow(sb, org, projectId, (row) => ({ brief_json: change((row.brief_json ?? {}) as Row, row) }));
    if (r.ok === false) fail("media_production_projects", { message: r.error });
  }
  async function freshRow(projectId: string): Promise<Row> {
    const { data, error } = await sb.from("media_production_projects").select("autonomy, brief_json").eq("id", projectId).eq("organization_id", org).single();
    if (error) fail("media_production_projects", error);
    return (data ?? {}) as Row;
  }
  // The project's primary finished video (not a ratio variant), newest first: what the social copy and the site draft use.
  async function primaryVideo(projectId: string) {
    const { data, error } = await sb.from("media_assets").select("id, object_url, checksum_sha256, metadata").eq("organization_id", org).eq("media_project_id", projectId).eq("is_current", true).eq("mime_type", FINISHED_VIDEO_MIME).order("created_at", { ascending: false });
    if (error) fail("media_assets", error);
    return ((data ?? []) as Array<{ id: string; object_url: string | null; checksum_sha256: string | null; metadata: { variantOf?: string } | null }>).find((a) => !a.metadata?.variantOf && a.object_url);
  }

  // B26 part 2: the drafts exist but the project's cut of some ratio is not the one a draft was built with (re-rendered
  // after the drafts were made): swap those drafts' media in place (draft-refresh.ts). Old records without posts: untouched.
  async function refreshSocialDrafts(project: AdvanceProject, rows: RatioRow[], rec: { at?: string; count?: number; posts?: DraftPost[] }, runId: string | undefined): Promise<string> {
    const todo = postsToRefresh(rec.posts, rows);
    if (!todo.length) return "社群草稿先前已建立";
    assertRun(await freshRow(project.id), runId, true);   // a person's stop ends it before any draft is touched
    const primaryId = (await primaryVideo(project.id))?.id;
    if (!primaryId) throw new Error("找不到主成片，沒換社群草稿的影片");
    const videoRows = await loadVideoRows(sb, org, primaryId);
    const releases = await draftDeps(sb, org, videoRows, actor).releases();
    const result = await refreshDrafts({
      async cut(ratio) { const r = releases.find((x) => x.ratio === ratio), row = rows.find((x) => x.ratio === ratio); return r && row ? { checksum: row.checksum, videoUrl: r.videoUrl, coverUrl: r.coverUrl ?? null } : null; },
      async post(postId) {
        try { const p = await getPost(org, postId); return { id: p.id, version: p.version, state: p.state, targetStates: p.targets.map((t) => t.state), media: p.media }; }
        catch (e) { if ((e as { status?: number }).status === 404) return null; throw e; }
      },
      addVideo: (url, fileName, coverUrl, deadline) => addVideo(org, url, fileName, actor, coverUrl, deadline),
      async swap(post, media, videoUrl) { await savePost(org, post.id, post.version, { source_url: videoUrl }, null, media.map((m) => ({ media_id: m.media_id, position: m.position, alt_text: m.alt_text })), actor); },
      save: (posts) => patchBrief(project.id, (now, row) => (assertRun(row, runId, false), { ...now, autoDrafts: { ...(now.autoDrafts as Row), posts } })),
    }, rec.posts ?? [], rows);
    return [result.swapped ? `已把 ${result.swapped} 個社群草稿換成新版影片` : "", keptNote({ posts: result.posts })].filter(Boolean).join("；") || "社群草稿先前已建立";
  }

  // The brand's social drafts, once per project (brief_json.autoDrafts); later re-rendered cuts reach them (refreshSocialDrafts).
  async function socialDrafts(project: AdvanceProject, rows: RatioRow[]): Promise<string> {
    const { data: proj, error } = await sb.from("media_production_projects").select("brief_json").eq("id", project.id).eq("organization_id", org).single();
    if (error) fail("media_production_projects", error);
    const brief = (proj?.brief_json ?? {}) as Record<string, unknown>;
    if (brief.autoDrafts) return refreshSocialDrafts(project, rows, brief.autoDrafts as { posts?: DraftPost[] }, parseAutoBudget(brief.autoBudget)?.runId);
    let budget = parseAutoBudget(brief.autoBudget);
    const runId = budget?.runId;
    const mark = (count: number, posts?: DraftPost[]) => patchBrief(project.id, (now, row) => (assertRun(row, runId, false), { ...now, autoDrafts: { at: new Date().toISOString(), count, ...(posts ? { posts } : {}) } }));
    const accounts = (await listAccounts(org, { hydrateProfile: false })).filter((a) => a.status === "connected");
    const keys = writerKeysFor(accounts.map((a) => a.platform));
    if (!keys.length) { await mark(0); return accounts.length ? "已連頻道的平台都還不能自動寫文案，沒建草稿" : "沒有連上的社群頻道，已核准發布但沒建草稿"; }

    const primaryId = (await primaryVideo(project.id))?.id;
    if (!primaryId) throw new Error("找不到主成片，沒建社群草稿");
    const videoRows = await loadVideoRows(sb, org, primaryId);
    const script = videoRows.find((r) => r.id === primaryId)?.metadata?.script ?? project.title;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
    const { data: site } = await sb.from("wp_sites").select("content_defaults").eq("organization_id", org).eq("active", true).limit(1).maybeSingle();
    const written = await runForOrg(org, actor, async () => {
      const writer = await claudeWriter(await grantFor("content.syndicate"), apiKey, "lib/content/video/project-advance", null);
      const saveBudget = (beforeSpending: boolean) => patchBrief(project.id, (now, row) => {
        assertRun(row, runId, beforeSpending);
        return { ...now, autoBudget: { ...(now.autoBudget as Row), spentTwd: budget!.spentTwd } };
      });
      const ask = async (prompt: string) => {
        if (!budget) return writer.ask(prompt); // Existing topic/legacy runs have their own controls.
        const before = { ...budget }, used = writer.spent.usd;
        budget = reserveDraftCall(budget, prompt);
        await saveBudget(true); // Reserve before the paid call; an interrupted call keeps this conservative reservation.
        const answer = await writer.ask(prompt);
        budget = { ...budget, spentTwd: Math.round((before.spentTwd + usdToNtd(writer.spent.usd - used)) * 100) / 100 };
        await saveBudget(false);
        return answer;
      };
      const defaults = (site?.content_defaults ?? undefined) as SiteContentDefaults | undefined;
      return writeSocialPosts({ article: script, keys, mediaType: "video", voice: renderSiteVoice(defaults), siteLanguage: siteLanguage(defaults) }, ask);
    });
    if (written.tooLong.length) throw new Error(`社群文案超過平台上限：${written.tooLong.map((t) => `${t.key} ${t.length}/${t.limit}`).join("、")}`);
    if (written.wrongLanguage.length) throw new Error(`社群文案不是${written.language}：${written.wrongLanguage.join("、")}`);
    const texts = textsForAccounts(written, accounts);
    const items = accounts.filter((a) => texts[a.id]).map((a) => ({ accountId: a.id, text: texts[a.id] }));
    const result = await saveVideoSocialDrafts(draftDeps(sb, org, videoRows, actor), project.title, items);
    if (result.ok === false) throw new Error(result.error);
    // Which cut each draft was built with (the project's current cut of its ratio): what a later re-render is compared to.
    await mark(result.drafts.length, result.drafts.map((d) => ({ postId: d.postId, ratio: d.ratio, mediaId: d.mediaId, ...(rows.find((r) => r.ratio === d.ratio)?.checksum ? { checksum: rows.find((r) => r.ratio === d.ratio)!.checksum } : {}) })));
    return `${result.drafts.length} 個社群草稿`;
  }

  // Plan U5.3 (§13 C2): 「同時建一篇網站草稿文章並嵌入」 -- the quick-render route wrote brief_json.autoEmbed {siteId};
  // the same function as the release panel's 建新草稿文章並嵌入 (embedVideoInNewDraft: a draft only, never live), once.
  async function embedDraft(project: AdvanceProject): Promise<string | null> {
    const { data: proj, error } = await sb.from("media_production_projects").select("brief_json").eq("id", project.id).eq("organization_id", org).single();
    if (error) fail("media_production_projects", error);
    const brief = (proj?.brief_json ?? {}) as Record<string, unknown>, ask = brief.autoEmbed as { siteId?: unknown } | undefined;
    if (typeof ask?.siteId !== "string" || brief.autoEmbedded) return null;
    const runId = parseAutoBudget(brief.autoBudget)?.runId;
    const primary = await primaryVideo(project.id);
    if (!primary) throw new Error("找不到主成片，沒建網站草稿文章");
    const { data: rel } = await sb.from("media_releases").select("id").eq("organization_id", org).eq("candidate_asset_id", primary.id).eq("status", "release_approved").limit(1);
    assertRun(await freshRow(project.id), runId, true);
    const r = await embedVideoInNewDraft(orgIdentity(org), { siteId: ask.siteId, title: project.title, videoUrl: String(primary.object_url), releaseId: rel?.[0]?.id ? String(rel[0].id) : undefined, variant: "default" });
    if ("blockedMode" in r) throw new Error(`網站草稿文章沒建成：系統目前是「${r.blockedMode}」模式`);
    if (r.ok === false) throw new Error(`網站草稿文章沒建成：${r.error}`);
    await patchBrief(project.id, (now, row) => (assertRun(row, runId, false), { ...now, autoEmbedded: { at: new Date().toISOString(), postId: r.postId } }));
    return `已嵌入網站草稿文章 #${r.postId}`;
  }

  return {
    now: () => Date.now(),

    async renderState(projectId) {
      const project = await sb.from("media_production_projects").select("brief_json").eq("id", projectId).eq("organization_id", org).maybeSingle();
      if (project.error) fail("media_production_projects", project.error);
      const budget = project.data?.brief_json?.autoBudget;
      if (budget?.runId && Array.isArray(budget.renderRatios) && budget.renderRatios.length) {
        // B26 part 2: a resume that declared a re-render counts only the renders sent after it (rerender-mark.ts); until one
        // is sent the project waits, so the earlier cut is never taken as this run's result.
        const since = rerenderSince(project.data?.brief_json, budget.runId);
        let jobs = sb.from("video_jobs").select("id").eq("organization_id", org).eq("record_params->>projectId", projectId)
          .eq("record_params->>autoRunId", budget.runId);
        if (since) jobs = jobs.gte("created_at", since);
        const { data, error } = await jobs.order("created_at", { ascending: false }).limit(30);
        if (error) fail("video_jobs", error);
        const covered = new Set<string>();
        for (const row of data || []) {
          const job = await readJob(String(row.id));
          if (!job) continue;
          const ratios = job.recordParams?.formats || [];
          if (ratios.length && ratios.every((r) => covered.has(r))) continue;
          const result = await finalizeVideoJob(job);
          if (result.status === "error") return { state: "error", error: result.error || "影片輸出失敗" };
          if (result.status !== "done") return { state: "running" };
          for (const ratio of ratios) covered.add(ratio);
        }
        // Job rows are deleted after an hour (job-store TTL): a ratio whose job is gone but whose cut was made since the mark is covered.
        if (since) for (const cut of newestPerRatio(createdSince(await projectVideoRows(sb, org, projectId), since))) covered.add(cut.ratio);
        if (budget.renderRatios.every((r: string) => covered.has(r))) return { state: "done" };
        return Date.now() - Math.max(Date.parse(budget.startedAt || ""), since ? Date.parse(since) : 0) > WAIT_LIMIT_MS
          ? { state: "error", error: "超過兩小時仍未收齊這次執行的所有比例" } : { state: "running" };
      }
      const { data, error } = await sb.from("video_jobs").select("id").eq("organization_id", org).eq("record_params->>projectId", projectId).order("created_at", { ascending: false }).limit(1);
      if (error) fail("video_jobs", error);
      const job = data?.length ? await readJob(String(data[0].id)) : null;
      if (!job) return { state: "none" };
      const r = await finalizeVideoJob(job);
      if (r.status === "running") return { state: "running" };
      if (r.status === "error") return { state: "error", error: r.error ?? "unknown" };
      return r.status === "done" ? { state: "done" } : { state: "none" };
    },

    // One row per ratio, the newest: a re-rendered or re-attached video replaces the older one of its ratio (plan U0).
    async rows(projectId) {
      // After a resume that declared a re-render only the cuts made after it are this run's (rerender-mark.ts).
      const brief = (await freshRow(projectId)).brief_json as Row | null;
      const since = rerenderSince(brief, parseAutoBudget(brief?.autoBudget)?.runId);
      return newestPerRatio(createdSince(await projectVideoRows(sb, org, projectId), since)).map((a) => ({ id: a.id, ratio: a.ratio, checksum: String(a.checksum_sha256) }));
    },

    async qaProblems(row) {
      const base = { organizationId: org, candidateAssetId: row.id, candidateChecksum: row.checksum };
      const r = await persistEditorialRightsQa(sb, base);
      if (r.ok === false) return [`檢查沒跑成（${r.error}）`];
      const ev = await loadAuthoritativeReleaseEvidence(sb, base);
      if (ev.ok === false) return [ev.error];
      if (ev.gate.ok) return [];
      const { data } = await sb.from("media_qa_reports").select("qa_kind, status, report_json").eq("organization_id", org).eq("candidate_asset_id", row.id).eq("candidate_checksum", row.checksum).order("created_at", { ascending: false }).limit(40);
      const latest = new Map<string, { status: string; report_json: unknown }>();
      for (const q of (data ?? []) as Array<{ qa_kind: string; status: string; report_json: unknown }>) if (!latest.has(q.qa_kind)) latest.set(q.qa_kind, q);
      const why = REQUIRED_RELEASE_QA_KINDS.flatMap((k) => {
        const q = latest.get(k);
        if (!q) return [`${QA_LABELS[k]}還沒有結果`];
        if (q.status === "passed") return [];
        const reasons = summarizeQaFindings(q.report_json, q.status).slice(0, 3).map(explainFinding).join("、");
        return [`${QA_LABELS[k]}未通過${reasons ? `（${reasons}）` : ""}`];
      });
      return why.length ? why : [ev.gate.message];
    },

    async release(row) {
      const { data, error } = await sb.from("media_releases").select("id").eq("organization_id", org).eq("candidate_asset_id", row.id).eq("candidate_checksum", row.checksum).eq("status", "release_approved").limit(1);
      if (error) fail("media_releases", error);
      if (data?.length) return;
      const created = await createApprovedRelease(sb, { organizationId: org, candidateAssetId: row.id, candidateChecksum: row.checksum });
      if (created.ok === false) throw new Error(`Release 沒建成：${String(created.body.message ?? created.body.error)}`);
    },

    async drafts(project, rows) {
      const social = await socialDrafts(project, rows);
      const embedded = await embedDraft(project);
      return embedded ? `${social}；${embedded}` : social;
    },

    async update(projectId, patch, runId) {
      const saved = await updateProjectRow(sb, org, projectId, (row) => (assertRun(row, runId, false), {
        ...(patch.lifecycleStage ? { lifecycle_stage: patch.lifecycleStage } : {}),
        ...(patch.autonomy ? { autonomy: patch.autonomy } : {}),
        ...(patch.lastError !== undefined ? { last_error: patch.lastError } : {}),
      }));
      if (saved.ok === false) fail("media_production_projects", { message: saved.error });
      if (patch.lifecycleStage === "measure" || patch.lastError) {
        const { data: p, error: readError } = await sb.from("media_production_projects").select("title, source_ref, brief_json").eq("id", projectId).eq("organization_id", org).maybeSingle();
        if (readError) fail("media_production_projects", readError);
        const brief = (p?.brief_json ?? {}) as Record<string, unknown>, budget = parseAutoBudget(brief.autoBudget);
        if (budget) {
          const stale = keptNote(brief.autoDrafts); // B26 part 2: sent posts keep the older cut; say so
          const result = patch.lastError ? "停下：" + patch.lastError : "草稿已完成" + (stale ? `（${stale}）` : ""), key = budget.runId + ":" + result;
          if ((brief.autoNotification as { key?: string } | undefined)?.key !== key) {
            const notifier = buildOperatorTelegramNotifier(), host = productHost(PRODUCTS.find((p) => p.key === "video")!);
            const url = "https://" + host + "/?" + new URLSearchParams({ open: "projects", project: String(p?.source_ref || ""), episode: budget.episodeId || "" });
            const delivery = notifier ? await notifier.sendText(`${String(p?.title || "影片")}：${result}\n已用 NT$${budget.spentTwd}／上限 NT$${budget.budgetTwd}\n${url}`) : { kind: "rejected" as const, code: "notifier_disabled" };
            if (delivery.kind === "sent" || delivery.kind === "uncertain")
              await patchBrief(projectId, (now) => ({ ...now, autoNotification: { key, at: new Date().toISOString(), status: delivery.kind } }));
            else console.warn("[video-auto-run] outcome notification not delivered:", delivery.code);
          }
        }
      }
    },
  };
}
