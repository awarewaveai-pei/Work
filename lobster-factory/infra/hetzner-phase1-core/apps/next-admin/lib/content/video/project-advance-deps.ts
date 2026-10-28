/** The real dependencies of advanceProject (project-advance.ts) for one organization: the video job store, QA, Release and social stores. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { QA_LABELS, findingLabel } from "@/app/(shell)/tools/video/qa-labels";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import { renderSiteVoice, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { listAccounts } from "@/lib/social/store";
import { textsForAccounts, writerKeysFor, writeSocialPosts } from "@/lib/social/write-posts";
import { claudeWriter } from "@/lib/social/write-posts-claude";
import { persistEditorialRightsQa } from "./editorial-rights-persist";
import { finalizeVideoJob } from "./finalize";
import { readJob } from "./job-store";
import { ratioOfUrl } from "./platform-ratio";
import type { AdvanceDeps } from "./project-advance";
import { REQUIRED_RELEASE_QA_KINDS, loadAuthoritativeReleaseEvidence } from "./release-evidence";
import { createApprovedRelease } from "./release-create";
import { summarizeQaFindings } from "./qa-findings-summary";
import { saveVideoSocialDrafts } from "./social-drafts";
import { draftDeps, loadVideoRows } from "./social-drafts-deps";

const fail = (what: string, e: { message: string }): never => { throw new Error(`${what}: ${e.message}`); };

export function advanceDeps(sb: SupabaseClient, org: string, actor: string): AdvanceDeps {
  return {
    now: () => Date.now(),

    async renderState(projectId) {
      const { data, error } = await sb.from("video_jobs").select("id").eq("organization_id", org).eq("record_params->>projectId", projectId).order("created_at", { ascending: false }).limit(1);
      if (error) fail("video_jobs", error);
      const job = data?.length ? await readJob(String(data[0].id)) : null;
      if (!job) return { state: "none" };
      const r = await finalizeVideoJob(job);
      if (r.status === "running") return { state: "running" };
      if (r.status === "error") return { state: "error", error: r.error ?? "unknown" };
      return r.status === "done" ? { state: "done" } : { state: "none" };
    },

    async rows(projectId) {
      const { data, error } = await sb.from("media_assets").select("id, object_url, checksum_sha256").eq("organization_id", org).eq("media_project_id", projectId).eq("is_current", true).eq("mime_type", "video/mp4");
      if (error) fail("media_assets", error);
      return (data ?? []).flatMap((a) => { const ratio = ratioOfUrl(a.object_url as string | null); return ratio && a.checksum_sha256 ? [{ id: String(a.id), ratio, checksum: String(a.checksum_sha256) }] : []; });
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
        const reasons = summarizeQaFindings(q.report_json).slice(0, 3).map((f) => findingLabel(f.rule, f.message)).join("、");
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

    async drafts(project) {
      const { data: proj, error } = await sb.from("media_production_projects").select("brief_json").eq("id", project.id).eq("organization_id", org).single();
      if (error) fail("media_production_projects", error);
      const brief = (proj?.brief_json ?? {}) as Record<string, unknown>;
      if (brief.autoDrafts) return "社群草稿先前已建立";
      const mark = async (count: number) => {
        const { error: e } = await sb.from("media_production_projects").update({ brief_json: { ...brief, autoDrafts: { at: new Date().toISOString(), count } } }).eq("id", project.id).eq("organization_id", org);
        if (e) fail("media_production_projects", e);
      };
      const accounts = (await listAccounts(org, { hydrateProfile: false })).filter((a) => a.status === "connected");
      const keys = writerKeysFor(accounts.map((a) => a.platform));
      if (!keys.length) { await mark(0); return accounts.length ? "已連頻道的平台都還不能自動寫文案，沒建草稿" : "沒有連上的社群頻道，已核准發布但沒建草稿"; }

      const { data: assets } = await sb.from("media_assets").select("id, metadata").eq("organization_id", org).eq("media_project_id", project.id).eq("is_current", true);
      const primaryId = ((assets ?? []) as Array<{ id: string; metadata: { variantOf?: string } | null }>).find((a) => !a.metadata?.variantOf)?.id;
      if (!primaryId) throw new Error("找不到主成片，沒建社群草稿");
      const videoRows = await loadVideoRows(sb, org, primaryId);
      const script = videoRows.find((r) => r.id === primaryId)?.metadata?.script ?? project.title;
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
      const { data: site } = await sb.from("wp_sites").select("content_defaults").eq("organization_id", org).eq("active", true).limit(1).maybeSingle();
      const written = await runForOrg(org, actor, async () => {
        const { ask } = await claudeWriter(await grantFor("content.syndicate"), apiKey, "lib/content/video/project-advance", null);
        return writeSocialPosts({ article: script, keys, mediaType: "video", voice: renderSiteVoice((site?.content_defaults ?? undefined) as SiteContentDefaults | undefined) }, ask);
      });
      if (written.tooLong.length) throw new Error(`社群文案超過平台上限：${written.tooLong.map((t) => `${t.key} ${t.length}/${t.limit}`).join("、")}`);
      const texts = textsForAccounts(written, accounts);
      const items = accounts.filter((a) => texts[a.id]).map((a) => ({ accountId: a.id, text: texts[a.id] }));
      const result = await saveVideoSocialDrafts(draftDeps(sb, org, videoRows, actor), project.title, items);
      if (result.ok === false) throw new Error(result.error);
      await mark(result.drafts.length);
      return `${result.drafts.length} 個社群草稿`;
    },

    async update(projectId, patch) {
      const { error } = await sb.from("media_production_projects").update({
        ...(patch.lifecycleStage ? { lifecycle_stage: patch.lifecycleStage } : {}),
        ...(patch.autonomy ? { autonomy: patch.autonomy } : {}),
        ...(patch.lastError !== undefined ? { last_error: patch.lastError } : {}),
        updated_at: new Date().toISOString(),
      }).eq("id", projectId).eq("organization_id", org);
      if (error) fail("media_production_projects", error);
    },
  };
}
