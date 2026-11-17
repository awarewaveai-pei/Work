"use client";

import { useEffect, useMemo, useState } from "react";
import OrganizationPicker from "./OrganizationPicker";
import { buttonStyle, cardStyle, inputStyle, optionStyle } from "@/components/tools/panel-primitives";
import { QA_LABELS, STATUS_TEXT, BLOCKED_NOTE, explainFinding } from "./qa-labels";
import { RATIO_LABEL, ratioFor, ratioOfAsset } from "@/lib/content/video/platform-ratio";
import { textsForAccounts, writerKeysFor } from "@/lib/social/write-posts";
import { defaultCopy, syndicateCostTwd } from "@/lib/content/video/release-copy";

const card: React.CSSProperties = { ...cardStyle(), padding: 14, display: "grid", gap: 9 };
const field = inputStyle();
const btn = (on: boolean): React.CSSProperties => ({ ...buttonStyle({ tone: "primary", disabled: !on }), width: "fit-content" });
const chip = (on: boolean): React.CSSProperties => ({ ...optionStyle(on), textAlign: "left" });

const KINDS = ["technical", "caption", "editorial", "rights"] as const;
type Asset = { id: string; object_url: string; checksum_sha256?: string; metadata?: { title?: string; variantOf?: string; script?: string; ratio?: string; captionFiles?: { srt?: string; vtt?: string; cues?: number } }; created_at: string; asset_domain: string };
type Cover = { id: string; url: string; kind: "auto" | "ai" | "upload"; chosen: boolean };
const COVER_KIND: Record<Cover["kind"], string> = { auto: "自動", ai: "AI", upload: "上傳" };
type Qa = { kind: string; status: string; candidateChecksum: string; findings?: Array<{ rule: string; message: string; evidence?: Record<string, number | string | null> }> };
type Account = { id: string; platform: string; label: string; status: string };
type Site = { id: string; name: string; organization_id?: string | null };
type WpPost = { id: number; title: string; status: string };

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url); return r.ok ? await r.json() as T : null; } catch { return null; }
}
async function postJson(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await r.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: r.ok && json.ok !== false, json };
  } catch { return { ok: false, json: { error: "網路錯誤" } }; }
}

/** Release gate (one Release per finished ratio, only when its four QA kinds passed), then social drafts and a WordPress embed. */
// organizationLocked = the video project owns the organization: no picker.
export default function ReleaseDeliveryPanel({ initialOrganizationId, initialCandidateAssetId, onReleaseCreated, organizationLocked = false }: { initialOrganizationId?: string; initialCandidateAssetId?: string; onReleaseCreated?: (releaseId: string) => void; organizationLocked?: boolean } = {}) {
  const [organizationId, setOrganizationId] = useState(initialOrganizationId ?? "");
  const [candidateId, setCandidateId] = useState(initialCandidateAssetId ?? "");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [qa, setQa] = useState<Record<string, Qa[]>>({});
  const [released, setReleased] = useState<Record<string, string>>({});   // ratio row id -> approved Release id
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState<{ drafts: { id: string }[]; articles: { title: string; editUrl: string | null }[]; socialUrl?: string } | null>(null);
  const [covers, setCovers] = useState<Record<string, Cover[]>>({});   // ratio row id -> its covers (VD.3)
  const [coverRights, setCoverRights] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ticked, setTicked] = useState<string[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [wpPosts, setWpPosts] = useState<WpPost[]>([]);

  const org = organizationId.trim();
  async function loadOutcome() {
    if (!org || !candidateId) return;
    setOutcome(await getJson(`/api/video/draft-outcome?organizationId=${encodeURIComponent(org)}&candidateAssetId=${encodeURIComponent(candidateId)}`));
  }
  useEffect(() => { setOutcome(null); void loadOutcome(); }, [org, candidateId]);
  const changed = () => window.parent.postMessage({ type: "vw:workflow-changed" }, window.location.origin);
  const primaries = useMemo(() => assets.filter((a) => !a.metadata?.variantOf), [assets]);
  const primary = assets.find((a) => a.id === candidateId);
  const rows = useMemo(() => assets.filter((a) => a.id === candidateId || a.metadata?.variantOf === candidateId)
    .map((a) => ({ ...a, ratio: ratioOfAsset(a) ?? "" })).filter((a) => a.ratio), [assets, candidateId]);
  const releasedRows = rows.filter((r) => released[r.id]);
  const releasedRatios = releasedRows.map((r) => r.ratio);

  useEffect(() => {
    if (!org) { setAssets([]); setAccounts([]); setSites([]); return; }
    let cancelled = false;
    void getJson<{ items?: Asset[] }>(`/api/video/assets?organizationId=${encodeURIComponent(org)}&includeWorkbench=1`).then((j) => { if (!cancelled) setAssets(j?.items ?? []); });
    void getJson<{ accounts?: Account[] }>(`/api/video/social-channels?organizationId=${encodeURIComponent(org)}`).then((j) => { if (!cancelled) setAccounts(j?.accounts ?? []); });
    void getJson<{ sites?: Site[] }>("/api/content/sites").then((j) => { if (!cancelled) setSites((j?.sites ?? []).filter((s) => s.organization_id === org)); });
    return () => { cancelled = true; };
  }, [org]);

  // Another video = nothing of the last one's channels, texts or covers carries over (a default text is written only
  // into an EMPTY box, so a kept text would be posted with the wrong video; Codex 63d19a26 F3).
  useEffect(() => { setTicked([]); setTexts({}); setCovers({}); setCoverRights(false); }, [candidateId]);

  // Every ratio row gets its editorial/rights QA computed (it reads the row's own metadata), then its QA reports and Release are read back.
  async function refresh() {
    if (!org || rows.length === 0) return;
    await Promise.all(rows.filter((r) => (r.checksum_sha256 ?? "").length >= 16).map((r) => postJson("/api/video/qa/editorial-rights", { organizationId: org, candidateAssetId: r.id, candidateChecksum: r.checksum_sha256 })));
    const reports = await Promise.all(rows.map(async (r) => [r.id, (await getJson<{ items?: Qa[] }>(`/api/video/qa/reports?organizationId=${encodeURIComponent(org)}&candidateAssetId=${r.id}`))?.items ?? []] as const));
    setQa(Object.fromEntries(reports));
    const rel = await getJson<{ items?: Array<{ id: string; candidate_asset_id: string; candidate_checksum: string }> }>(`/api/video/release?organizationId=${encodeURIComponent(org)}&candidateAssetIds=${rows.map((r) => r.id).join(",")}`);
    const out: Record<string, string> = {};
    for (const r of rel?.items ?? []) if (rows.find((x) => x.id === r.candidate_asset_id)?.checksum_sha256 === r.candidate_checksum && !out[r.candidate_asset_id]) out[r.candidate_asset_id] = r.id;
    setReleased(out);
    await loadCovers();
  }

  // Card VD.3: each ratio row's covers (lib/content/video/cover.ts decides the chosen one; this page only shows and picks).
  async function loadCovers() {
    if (!org || rows.length === 0) return;
    const j = await getJson<{ covers?: Record<string, Cover[]> }>(`/api/video/cover?organizationId=${encodeURIComponent(org)}&assetIds=${rows.map((r) => r.id).join(",")}`);
    setCovers(j?.covers ?? {});
  }
  async function chooseCover(rowId: string, coverAssetId: string) {
    setBusy(true); setMessage("");
    const res = await postJson("/api/video/cover", { organizationId: org, assetId: rowId, coverAssetId });
    if (res.ok) await loadCovers(); else setMessage(String(res.json.error ?? "換封面失敗"));
    setBusy(false);
  }
  async function uploadCover(rowId: string, file: File | undefined) {
    if (!file) return;
    setBusy(true); setMessage("");
    const form = new FormData();
    form.set("assetId", rowId); form.set("rightsConfirmed", coverRights ? "true" : "false"); form.set("file", file);
    try {
      const r = await fetch(`/api/video/cover?organizationId=${encodeURIComponent(org)}`, { method: "POST", body: form });
      const json = await r.json().catch(() => ({})) as Record<string, unknown>;
      if (r.ok && json.ok !== false) { await loadCovers(); setMessage("✅ 已換成你上傳的封面"); } else setMessage(String(json.error ?? "上傳封面失敗"));
    } catch { setMessage("網路錯誤"); }
    finally { setCoverRights(false); }   // the rights box is about ONE image, whatever happened to it (Codex 9bea8a27 F2, 08e0141d F2)
    setBusy(false);
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [candidateId, assets]);

  const statusOf = (rowId: string, checksum: string | undefined, kind: string) => (qa[rowId] ?? []).find((q) => q.kind === kind && q.candidateChecksum === checksum);

  async function approve(row: (typeof rows)[number]) {
    setBusy(true); setMessage("");
    const res = await postJson("/api/video/release", { organizationId: org, candidateAssetId: row.id, candidateChecksum: row.checksum_sha256 });
    const release = res.json.release as { id?: string } | undefined;
    if (res.ok && release?.id) { setReleased((s) => ({ ...s, [row.id]: release.id! })); onReleaseCreated?.(release.id); setMessage(`✅ ${RATIO_LABEL[row.ratio]} 已核准發布`); }
    else setMessage(String(res.json.message ?? res.json.error ?? "核准失敗"));
    setBusy(false);
  }

  async function writeCopy() {
    const keys = [...new Set(ticked.flatMap((id) => writerKeysFor([accounts.find((a) => a.id === id)?.platform ?? ""])))];
    if (!keys.length) { setMessage("這些頻道的平台還沒有文案寫法，請自己填文案"); return; }
    setBusy(true); setMessage("");
    const res = await postJson("/api/content/syndicate", { article: primary?.metadata?.script || primary?.metadata?.title || "video", platforms: keys, mediaType: "video", siteId: sites[0]?.id });
    if (res.ok) {
      const mine = accounts.filter((a) => ticked.includes(a.id));
      setTexts((t) => ({ ...t, ...textsForAccounts(res.json as never, mine) }));
      const tooLong = (res.json.tooLong as unknown[] | undefined)?.length ?? 0;
      setMessage(tooLong ? "有幾個頻道的文案超過平台上限，請改短後再存。" : "");
    } else setMessage(String(res.json.error ?? "文案產生失敗"));
    setBusy(false);
  }

  async function saveDrafts() {
    setBusy(true); setMessage("");
    const res = await postJson("/api/video/social-drafts", { organizationId: org, candidateAssetId: candidateId, items: ticked.map((id) => ({ accountId: id, text: texts[id] ?? "" })) });
    const drafts = (res.json.drafts as unknown[] | undefined)?.length ?? 0;
    setMessage(res.ok ? `✅ 已存成 ${drafts} 個社群草稿，到社群工具查看與發布。` : String(res.json.error ?? "存草稿失敗"));
    if (res.ok) { await loadOutcome(); changed(); }
    setBusy(false);
  }

  async function pickSite(id: string) {
    setSiteId(id); setWpPosts([]);
    setWpPosts((await getJson<{ posts?: WpPost[] }>(`/api/video/wp-posts?siteId=${encodeURIComponent(id)}`))?.posts ?? []);
  }

  // draftOnly / newDraftTitle: the server refuses anything that is not a draft, so this page cannot put an article live.
  async function embed(target: { postId: number } | { newDraftTitle: string }) {
    const ratio = ratioFor("wordpress", releasedRatios);
    const row = releasedRows.find((r) => r.ratio === ratio);
    if (!row) return;
    setBusy(true); setMessage("");
    const res = await postJson("/api/video/embed-to-wp", { siteId, ...target, draftOnly: true, videoUrl: row.object_url, releaseId: released[row.id], variant: "default" });
    if ("newDraftTitle" in target) void pickSite(siteId);   // the new draft shows in the list, also when the embed into it failed
    setMessage(res.ok ? "✅ 影片已嵌入草稿文章，到 WordPress 後台檢查後再自己發布。" : String(res.json.error ?? "嵌入失敗"));
    if (res.ok) { await loadOutcome(); changed(); }
    setBusy(false);
  }

  const tickedAll = ticked.length > 0 && ticked.every((id) => (texts[id] ?? "").trim());
  return <div style={{ padding: "20px 28px", display: "grid", gap: 14 }}>
    {!!(outcome?.drafts.length || outcome?.articles.length) && <section style={card} role="status">
      <b>完成：已建 {outcome.drafts.length} 個社群草稿</b>
      {!!outcome.drafts.length && outcome.socialUrl?.startsWith("https://") && <a href={outcome.socialUrl} target="_blank" rel="noopener noreferrer">查看社群草稿</a>}
      {outcome.articles.map((a, i) => <div key={i}>已嵌入〈{a.title}〉{a.editUrl?.startsWith("https://") && <> · <a href={a.editUrl} target="_blank" rel="noopener noreferrer">開啟草稿文章</a></>}</div>)}
    </section>}
    <div><b style={{ fontSize: 15 }}>發布</b><p style={{ margin: "4px 0", fontSize: 12, color: "var(--text-secondary)" }}>四項檢查都通過的比例才能核准發布；核准後可存成社群草稿，或嵌進網站文章。都是草稿，不會直接上線。</p></div>

    <section style={card}>
      <b>1. 成片與核准</b>
      {!organizationLocked && <div style={{ fontSize: 11 }}>客戶<div style={{ marginTop: 4 }}><OrganizationPicker value={organizationId} onChange={(id) => { setOrganizationId(id); setCandidateId(""); setQa({}); setReleased({}); setTicked([]); setTexts({}); }} /></div></div>}
      {!candidateId && <div style={{ display: "grid", gap: 6 }}>
        {primaries.length === 0 && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{org ? "這個客戶還沒有做好的影片" : "先選客戶"}</span>}
        {primaries.map((a) => <button key={a.id} type="button" onClick={() => setCandidateId(a.id)} style={chip(false)}>{a.metadata?.title ?? "影片"} · {new Date(a.created_at).toLocaleString()}</button>)}
      </div>}
      {candidateId && <div style={{ fontSize: 12 }}>影片：<b>{primary?.metadata?.title ?? "影片"}</b>{!initialCandidateAssetId && <button type="button" onClick={() => { setCandidateId(""); setQa({}); setReleased({}); }} style={{ ...chip(false), marginLeft: 8 }}>換一支</button>}</div>}
      {candidateId && rows.length === 0 && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>讀取成片中…</span>}
      {rows.map((r) => {
        const results = KINDS.map((k) => ({ k, q: statusOf(r.id, r.checksum_sha256, k) }));
        const allPassed = results.every((x) => x.q?.status === "passed");
        return <div key={r.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 13 }}>{RATIO_LABEL[r.ratio]}</b>
            <a href={r.object_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent-text)" }}>播放</a>
            {released[r.id] ? <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 700 }}>✅ 已核准發布</span>
              : <button type="button" disabled={busy || !allPassed} onClick={() => void approve(r)} style={btn(!busy && allPassed)}>核准這個比例發布</button>}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
            {results.map(({ k, q }) => <span key={k}>{QA_LABELS[k]}：{STATUS_TEXT[q?.status ?? "missing"]}</span>)}
          </div>
          {results.filter((x) => x.q && x.q.status !== "passed").flatMap((x) => (x.q?.findings ?? []).map((f, i) => <div key={`${x.k}${f.rule}${i}`} style={{ fontSize: 11.5, color: "var(--red)" }}>{QA_LABELS[x.k]}：{explainFinding(f)}</div>))}
          {!released[r.id] && results.some((x) => x.q && x.q.status !== "passed") && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{BLOCKED_NOTE}</div>}
          {r.metadata?.captionFiles?.srt && <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
            {/* VD.10: the spoken lines as files; YouTube Studio / Facebook take them by hand (the Postiz providers upload none) */}
            <span>字幕檔（{r.metadata.captionFiles.cues ?? 0} 句，上傳到 YouTube／Facebook 用）：</span>
            {/* same-origin attachment (app/api/video/subtitles): <a download> is ignored on the cross-origin bucket */}
            <a href={`/api/video/subtitles?organizationId=${encodeURIComponent(org)}&assetId=${r.id}&format=srt`} style={{ color: "var(--accent-text)" }}>下載 SRT</a>
            {r.metadata.captionFiles.vtt && <a href={`/api/video/subtitles?organizationId=${encodeURIComponent(org)}&assetId=${r.id}&format=vtt`} style={{ color: "var(--accent-text)" }}>下載 VTT</a>}
          </div>}
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12 }}>封面（YouTube 縮圖、IG 封面、網站影片預覽圖都用這張）</span>
            {(covers[r.id] ?? []).length === 0 ? <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>這支影片還沒有封面；可上傳一張。</span>
              : <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                {(covers[r.id] ?? []).map((c) => <button key={c.id} type="button" disabled={busy || c.chosen} aria-pressed={c.chosen} onClick={() => void chooseCover(r.id, c.id)}
                  title={c.chosen ? "目前的封面" : "改用這張"} style={{ padding: 2, borderRadius: 6, border: `2px solid ${c.chosen ? "var(--accent)" : "var(--border-subtle)"}`, background: "var(--card-bg)", cursor: c.chosen ? "default" : "pointer", display: "grid", gap: 2, justifyItems: "center" }}>
                  <img src={c.url} alt={c.chosen ? "目前的封面" : "封面候選"} loading="lazy" style={{ display: "block", height: c.chosen ? 96 : 56, maxWidth: 200, objectFit: "contain" }} />
                  <span style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>{c.chosen ? "使用中" : COVER_KIND[c.kind]}</span>
                </button>)}
              </div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 11.5 }}>
              <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={coverRights} onChange={(e) => setCoverRights(e.target.checked)} />我有權使用要上傳的圖</label>
              <label style={{ ...btn(!busy && coverRights), display: "inline-block" }}>上傳自己的封面（JPG／PNG，最大 2 MB，免費）
                <input type="file" accept="image/jpeg,image/png" disabled={busy || !coverRights} style={{ display: "none" }} onChange={(e) => { void uploadCover(r.id, e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
          </div>
        </div>;
      })}
    </section>

    <section style={card}>
      <b>2. 社群草稿</b>
      {releasedRows.length === 0 ? <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>先核准至少一個比例。</span>
        : accounts.length === 0 ? <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>這個客戶還沒有連上的社群頻道，到社群工具連線。</span>
        : <>
          <div style={{ display: "grid", gap: 6 }}>
            {accounts.map((a) => {
              const ratio = ratioFor(a.platform, releasedRatios);
              return <label key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                <input type="checkbox" checked={ticked.includes(a.id)} onChange={(e) => {
                  const on = e.target.checked;
                  setTicked((t) => on ? [...t, a.id] : t.filter((x) => x !== a.id));
                  // VD.9: free first -- a newly ticked channel starts with the title and the script's first line
                  if (on) setTexts((t) => (t[a.id] ?? "").trim() ? t : { ...t, [a.id]: defaultCopy(primary?.metadata?.title, primary?.metadata?.script) });
                }} />
                {a.label}（{a.platform}）→ {ratio ? RATIO_LABEL[ratio] : "沒有可用比例"}
              </label>;
            })}
          </div>
          {ticked.length > 0 && <>
            <button type="button" disabled={busy} onClick={() => void writeCopy()} style={btn(!busy)}>用 AI 改寫各頻道文案（Claude Haiku，約 NT${syndicateCostTwd()}）</button>
            {ticked.map((id) => <label key={id} style={{ fontSize: 11 }}>{accounts.find((a) => a.id === id)?.label} 的文案
              <textarea value={texts[id] ?? ""} onChange={(e) => setTexts((t) => ({ ...t, [id]: e.target.value }))} rows={3} style={{ ...field, marginTop: 4 }} /></label>)}
            <button type="button" disabled={busy || !tickedAll} onClick={() => void saveDrafts()} style={btn(!busy && tickedAll)}>存成社群草稿</button>
          </>}
        </>}
    </section>

    <section style={card}>
      <b>3. 嵌進網站文章</b>
      {releasedRows.length === 0 ? <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>先核准至少一個比例。</span>
        : sites.length === 0 ? <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>這個客戶沒有登記的網站。</span>
        : <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{sites.map((s) => <button key={s.id} type="button" onClick={() => void pickSite(s.id)} style={chip(s.id === siteId)}>{s.name}</button>)}</div>
          {siteId && <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>只列草稿和待審文章；已發布或排程中的文章不列，改它影片就直接上線。</span>
            <button type="button" disabled={busy} onClick={() => void embed({ newDraftTitle: primary?.metadata?.title || "影片" })} style={btn(!busy)}>建新草稿文章並嵌入</button>
            {wpPosts.length === 0 && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>這個網站沒有草稿文章</span>}
            {wpPosts.map((p) => <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <span style={{ flex: 1 }}>{p.title}（{p.status === "pending" ? "待審" : "草稿"}）</span>
              <button type="button" disabled={busy} onClick={() => void embed({ postId: p.id })} style={btn(!busy)}>嵌入影片</button>
            </div>)}
          </div>}
        </>}
    </section>
    {message && <div style={{ ...card, fontSize: 12, color: message.startsWith("✅") ? "var(--green)" : "var(--red)" }}>{message}</div>}
  </div>;
}
