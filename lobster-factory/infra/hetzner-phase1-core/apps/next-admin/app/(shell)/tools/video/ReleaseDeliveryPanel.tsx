"use client";

import { useEffect, useMemo, useState } from "react";
import OrganizationPicker from "./OrganizationPicker";
import { QA_LABELS, STATUS_TEXT, findingLabel } from "./qa-labels";
import { RATIO_LABEL, ratioFor, ratioOfUrl } from "@/lib/content/video/platform-ratio";
import { textsForAccounts, writerKeysFor } from "@/lib/social/write-posts";

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14, display: "grid", gap: 9 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-subtle)", color: "var(--text-primary)", fontSize: 12 };
const btn = (on: boolean): React.CSSProperties => ({ width: "fit-content", padding: "8px 12px", border: 0, borderRadius: 7, background: on ? "var(--accent)" : "var(--border-subtle)", color: on ? "var(--btn-primary-text)" : "var(--text-muted)", fontWeight: 700, cursor: on ? "pointer" : "not-allowed" });
const chip = (on: boolean): React.CSSProperties => ({ padding: "6px 10px", borderRadius: 7, border: `1px solid ${on ? "var(--accent)" : "var(--border-subtle)"}`, background: on ? "var(--bg-subtle)" : "var(--card-bg)", color: "var(--text-primary)", fontSize: 12, cursor: "pointer", textAlign: "left" });

const KINDS = ["technical", "caption", "editorial", "rights"] as const;
type Asset = { id: string; object_url: string; checksum_sha256?: string; metadata?: { title?: string; variantOf?: string; script?: string }; created_at: string; asset_domain: string };
type Qa = { kind: string; status: string; candidateChecksum: string; findings?: Array<{ rule: string; message: string }> };
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

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ticked, setTicked] = useState<string[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [wpPosts, setWpPosts] = useState<WpPost[]>([]);

  const org = organizationId.trim();
  const primaries = useMemo(() => assets.filter((a) => !a.metadata?.variantOf), [assets]);
  const primary = assets.find((a) => a.id === candidateId);
  const rows = useMemo(() => assets.filter((a) => a.id === candidateId || a.metadata?.variantOf === candidateId)
    .map((a) => ({ ...a, ratio: ratioOfUrl(a.object_url) ?? "" })).filter((a) => a.ratio), [assets, candidateId]);
  const releasedRows = rows.filter((r) => released[r.id]);
  const releasedRatios = releasedRows.map((r) => r.ratio);

  useEffect(() => {
    if (!org) { setAssets([]); setAccounts([]); setSites([]); return; }
    let cancelled = false;
    void getJson<{ items?: Asset[] }>(`/api/video/assets?organizationId=${encodeURIComponent(org)}`).then((j) => { if (!cancelled) setAssets(j?.items ?? []); });
    void getJson<{ accounts?: Account[] }>(`/api/video/social-channels?organizationId=${encodeURIComponent(org)}`).then((j) => { if (!cancelled) setAccounts(j?.accounts ?? []); });
    void getJson<{ sites?: Site[] }>("/api/content/sites").then((j) => { if (!cancelled) setSites((j?.sites ?? []).filter((s) => s.organization_id === org)); });
    return () => { cancelled = true; };
  }, [org]);

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
    setBusy(false);
  }

  async function pickSite(id: string) {
    setSiteId(id); setWpPosts([]);
    setWpPosts((await getJson<{ posts?: WpPost[] }>(`/api/video/wp-posts?siteId=${encodeURIComponent(id)}`))?.posts ?? []);
  }

  async function embed(postId: number) {
    const ratio = ratioFor("wordpress", releasedRatios);
    const row = releasedRows.find((r) => r.ratio === ratio);
    if (!row) return;
    setBusy(true); setMessage("");
    const res = await postJson("/api/video/embed-to-wp", { siteId, postId, videoUrl: row.object_url, releaseId: released[row.id], variant: "default" });
    setMessage(res.ok ? "✅ 影片已嵌入文章（文章狀態不變，草稿仍是草稿）。" : String(res.json.error ?? "嵌入失敗"));
    setBusy(false);
  }

  const tickedAll = ticked.length > 0 && ticked.every((id) => (texts[id] ?? "").trim());
  return <div style={{ padding: "20px 28px", display: "grid", gap: 14 }}>
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
          {results.filter((x) => x.q && x.q.status !== "passed").flatMap((x) => (x.q?.findings ?? []).map((f) => <div key={`${x.k}${f.rule}`} style={{ fontSize: 11.5, color: "var(--red)" }}>{QA_LABELS[x.k]}：{findingLabel(f.rule, f.message)}</div>))}
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
                <input type="checkbox" checked={ticked.includes(a.id)} onChange={(e) => setTicked((t) => e.target.checked ? [...t, a.id] : t.filter((x) => x !== a.id))} />
                {a.label}（{a.platform}）→ {ratio ? RATIO_LABEL[ratio] : "沒有可用比例"}
              </label>;
            })}
          </div>
          {ticked.length > 0 && <>
            <button type="button" disabled={busy} onClick={() => void writeCopy()} style={btn(!busy)}>用 AI 寫各頻道文案（Claude Haiku，約 US$0.01）</button>
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
            {wpPosts.length === 0 && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>這個網站沒有可選的文章</span>}
            {wpPosts.map((p) => <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
              <span style={{ flex: 1 }}>{p.title}（{p.status === "publish" ? "已發布" : p.status === "future" ? "排程" : "草稿"}）</span>
              <button type="button" disabled={busy} onClick={() => void embed(p.id)} style={btn(!busy)}>嵌入影片</button>
            </div>)}
          </div>}
        </>}
    </section>
    {message && <div style={{ ...card, fontSize: 12, color: message.startsWith("✅") ? "var(--green)" : "var(--red)" }}>{message}</div>}
  </div>;
}
