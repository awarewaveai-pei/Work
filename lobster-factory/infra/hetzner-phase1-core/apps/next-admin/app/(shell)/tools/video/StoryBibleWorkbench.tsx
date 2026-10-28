"use client";

import { useEffect, useMemo, useState } from "react";
import OrganizationPicker from "./OrganizationPicker";

type Row = { id: string; organization_id: string; series_id: string; revision: number; status: "draft" | "approved" | "superseded"; document_json: Bible; document_sha256: string; created_at: string; approved_at: string | null };
type AssetRef = { id: string; name: string; role?: string; referenceAssetIds: string[]; rightsNote?: string };
type RegisteredAsset = { id: string; object_url: string; checksum_sha256?: string; metadata?: { title?: string }; created_at: string; asset_domain: string };
type Bible = { schemaVersion: "1.0.0"; organizationId: string; seriesId: string; revision: number; state: "draft" | "approved"; characters: AssetRef[]; locations: AssetRef[]; props: AssetRef[]; continuity: { currentState: string[]; prohibitions: string[]; openThreads: string[] }; episode: { episodeId: string; premise: string; hook: string; beats: string[]; stateDelta: Record<string, unknown> }; provenance: { capabilityVersion: string; sourceArtifactIds: string[] } };

const emptyBible = (): Bible => ({ schemaVersion: "1.0.0", organizationId: "", seriesId: "series_1", revision: 1, state: "draft", characters: [], locations: [], props: [], continuity: { currentState: [], prohibitions: [], openThreads: [] }, episode: { episodeId: "ep_1", premise: "", hook: "", beats: [""], stateDelta: {} }, provenance: { capabilityVersion: "1.0.0", sourceArtifactIds: [] } });
const input: React.CSSProperties = { boxSizing: "border-box", width: "100%", padding: "8px 9px", borderRadius: 7, border: "1px solid var(--border-subtle)", background: "var(--card-bg)", color: "var(--text-primary)", fontSize: 12 };
const button = (color = "var(--accent)"): React.CSSProperties => ({ padding: "8px 12px", border: 0, borderRadius: 7, background: color, color: color === "var(--accent)" ? "var(--btn-primary-text)" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" });
const card: React.CSSProperties = { border: "1px solid var(--border-subtle)", borderRadius: 10, background: "var(--card-bg)", padding: 14 };
function strings(value: string): string[] { return value.split("\n").map((x) => x.trim()).filter(Boolean); }
function list(value: string[]): string { return value.join("\n"); }

export default function StoryBibleWorkbench() {
  const [organizationId, setOrganizationId] = useState("");
  const [bible, setBible] = useState<Bible>(emptyBible);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("先選租戶；角色參考素材會在儲存時驗證租戶歸屬。");
  const [assets, setAssets] = useState<RegisteredAsset[]>([]);
  const currentAssetIds = useMemo(() => [...new Set([...bible.characters, ...bible.locations, ...bible.props].flatMap((x) => x.referenceAssetIds).concat(bible.provenance.sourceArtifactIds))], [bible]);

  useEffect(() => {
    const org = organizationId.trim();
    if (!org) { setAssets([]); return; }
    let cancelled = false;
    // /api/video/assets 只回 video mime（Release/QA 候選片清單用）；角色/場景定裝照是圖片，
    // 改走 /api/video/reference-assets（同租戶 ai_generated+real_footage，無 mime 限制，本來就是孤兒
    // 端點——2026-09-11 查證發現全 repo 零呼叫者，這裡接上是它原本該用的地方）。
    fetch(`/api/video/reference-assets?organizationId=${encodeURIComponent(org)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("素材清單讀取失敗")))
      .then((json: { items?: RegisteredAsset[] }) => { if (!cancelled) setAssets(json.items ?? []); })
      .catch(() => { if (!cancelled) setAssets([]); });
    return () => { cancelled = true; };
  }, [organizationId]);

  const load = async () => {
    if (!organizationId.trim()) return setMessage("請先填 organization UUID");
    setBusy(true); try { const r = await fetch(`/api/video/story-bibles?organizationId=${encodeURIComponent(organizationId.trim())}`, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "讀取失敗"); setRows(j.items ?? []); setMessage(`已載入 ${(j.items ?? []).length} 個版本`); } catch (e) { setMessage(e instanceof Error ? e.message : "讀取失敗"); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!organizationId.trim()) return setMessage("請先填 organization UUID");
    setBusy(true); try { const r = await fetch("/api/video/story-bibles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: organizationId.trim(), storyBible: { ...bible, organizationId: organizationId.trim() } }) }); const j = await r.json(); if (!r.ok) throw new Error(j.findings?.map((f: { path: string; message: string }) => `${f.path}: ${f.message}`).join("；") || j.error || "儲存失敗"); setBible(j.item.document_json); setMessage(`已建立 ${j.item.series_id} r${j.item.revision} 草稿；內容雜湊 ${j.item.document_sha256.slice(0, 12)}…`); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "儲存失敗"); } finally { setBusy(false); }
  };
  const approve = async (id: string) => { setBusy(true); try { const r = await fetch(`/api/video/story-bibles/${id}/approve`, { method: "POST" }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "核准失敗"); setMessage(`已核准 ${j.item.series_id} r${j.item.revision}；先前核准版已標記 superseded`); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "核准失敗"); } finally { setBusy(false); } };
  const useRevision = (row: Row) => { setBible({ ...row.document_json, state: "draft" }); setOrganizationId(row.organization_id); setMessage(`已開啟 ${row.series_id} r${row.revision}；儲存會建立下一個不可覆寫版本。`); };
  const patchGroup = (group: "characters" | "locations" | "props", patch: (rows: AssetRef[]) => AssetRef[]) => setBible((v) => ({ ...v, [group]: patch(v[group]) }));
  const toggleAssetRef = (key: "characters" | "locations" | "props", index: number, assetId: string) => patchGroup(key, (xs) => xs.map((x, i) => i === index ? { ...x, referenceAssetIds: x.referenceAssetIds.includes(assetId) ? x.referenceAssetIds.filter((id) => id !== assetId) : [...x.referenceAssetIds, assetId] } : x));
  const group = (title: string, key: "characters" | "locations" | "props") => <div style={card}><b style={{ fontSize: 13 }}>{title}</b><span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>視覺參考從下方已登錄素材勾選；保存時逐一驗證租戶歸屬</span><div style={{ display: "grid", gap: 10, marginTop: 10 }}>{bible[key].map((row, index) => <div key={`${key}-${index}`} style={{ display: "grid", gap: 6, border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 8 }}>
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 28px", gap: 6 }}>
      <input style={input} value={row.id} placeholder="ID" onChange={(e) => patchGroup(key, (xs) => xs.map((x, i) => i === index ? { ...x, id: e.target.value } : x))} />
      <input style={input} value={row.name} placeholder="名稱／角色" onChange={(e) => patchGroup(key, (xs) => xs.map((x, i) => i === index ? { ...x, name: e.target.value } : x))} />
      <input style={input} value={row.role ?? ""} placeholder="角色定位（主角／配角／場景／道具用途）" onChange={(e) => patchGroup(key, (xs) => xs.map((x, i) => i === index ? { ...x, role: e.target.value } : x))} />
      <button type="button" title="移除" onClick={() => patchGroup(key, (xs) => xs.filter((_, i) => i !== index))} style={{ ...button("var(--red)"), padding: 0 }}>×</button>
    </div>
    <input style={input} value={row.rightsNote ?? ""} placeholder="版權／授權備註（選填）" onChange={(e) => patchGroup(key, (xs) => xs.map((x, i) => i === index ? { ...x, rightsNote: e.target.value } : x))} />
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 84, overflowY: "auto", padding: "4px 2px" }}>
      {assets.length === 0
        ? <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{organizationId.trim() ? "此租戶尚無已登錄素材" : "先選租戶以載入素材"}</span>
        : assets.map((a) => { const active = row.referenceAssetIds.includes(a.id); return <button key={a.id} type="button" onClick={() => toggleAssetRef(key, index, a.id)} title={a.id} style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 999, border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`, background: active ? "var(--accent)" : "var(--card-bg)", color: active ? "#fff" : "var(--text-secondary)", cursor: "pointer" }}>{active ? "✓ " : ""}{a.metadata?.title ?? a.asset_domain} · {a.id.slice(0, 8)}</button>; })}
    </div>
  </div>)}</div><button type="button" onClick={() => patchGroup(key, (xs) => [...xs, { id: `${key.slice(0, -1)}_${xs.length + 1}`, name: "", role: "", referenceAssetIds: [], rightsNote: "" }])} style={{ ...button("var(--bg-subtle)"), color: "var(--text-primary)", marginTop: 8 }}>＋ 新增{title}</button></div>;

  return <div style={{ padding: "22px 28px", display: "grid", gap: 14, maxWidth: 1260 }}>
    <div style={{ ...card, borderLeft: "4px solid var(--accent)" }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>短劇 Story Bible／角色連續性</div>
      <div style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6, marginTop: 5 }}>這是 Timeline 前的正式製作來源：每次保存會產生新 revision，不能覆寫；只有 owner／admin 可核准。角色、場景、道具與來源素材都必須屬於同一租戶。</div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
        <b style={{ color: "var(--text-primary)" }}>從這裡到出片的完整流程：</b>
        <div>① 這裡填角色／場景／連續性規則 →「儲存新草稿版本」→ owner／admin 按「核准」（未核准的版本不會出現在「手動生成」的選單裡）。</div>
        <div>② 到「✏️ 手動生成」腳本頁，「套用短劇 Story Bible」卡片選這個租戶＋剛核准的系列 → 產生的角度／腳本會自動套用角色設定，並在腳本產出後跑一次連續性檢查（比對「不可違反的設定」）。</div>
        <div>③ 角色若還沒有定裝照（下方「角色」區塊勾選的參考素材），系統會在腳本產出後自動生一張、存回這裡的新草稿版本——一樣要核准過才會變成正式版本；已核准過的角色下次直接沿用，不會重生。</div>
        <div>④ 腳本頁按「送去做影片」進到影片生產區，按「生成草稿」：場景畫面若該場景登場的角色已有定裝照，會自動改用能參考照片生圖的模型維持長相一致；草稿圖出來後會多一個「畫面一致性比對」面板，提示每個場景跟定裝照像不像（僅供參考，不會擋渲染）。</div>
        <div style={{ marginTop: 4, color: "var(--text-muted)" }}>角色參考素材（含自動生成的定裝照）在下方「角色」區塊的勾選清單裡管理；清單抓的是這個租戶已登錄的素材，沒看到想要的照片代表還沒登錄進系統。</div>
      </div>
    </div>
    <div style={{ ...card, display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}><label style={{ flex: "1 1 360px", fontSize: 12, color: "var(--text-secondary)" }}>租戶<div style={{ marginTop: 4 }}><OrganizationPicker value={organizationId} onChange={(id) => { setOrganizationId(id); setBible((v) => ({ ...v, organizationId: id })); }} /></div></label><button type="button" onClick={() => void load()} disabled={busy} style={button("var(--bg-subtle)")}>載入版本</button><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{message}</span></div>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 330px", gap: 14, alignItems: "start" }}><div style={{ display: "grid", gap: 14 }}>
      <div style={card}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><label style={{ fontSize: 12 }}>系列 ID<input style={{ ...input, marginTop: 4 }} value={bible.seriesId} onChange={(e) => setBible((v) => ({ ...v, seriesId: e.target.value }))} /></label><label style={{ fontSize: 12 }}>分集 ID<input style={{ ...input, marginTop: 4 }} value={bible.episode.episodeId} onChange={(e) => setBible((v) => ({ ...v, episode: { ...v.episode, episodeId: e.target.value } }))} /></label></div><label style={{ display: "block", marginTop: 10, fontSize: 12 }}>本集前提<textarea style={{ ...input, marginTop: 4, minHeight: 62 }} value={bible.episode.premise} onChange={(e) => setBible((v) => ({ ...v, episode: { ...v.episode, premise: e.target.value } }))} /></label><label style={{ display: "block", marginTop: 10, fontSize: 12 }}>結尾鉤子<textarea style={{ ...input, marginTop: 4, minHeight: 50 }} value={bible.episode.hook} onChange={(e) => setBible((v) => ({ ...v, episode: { ...v.episode, hook: e.target.value } }))} /></label><label style={{ display: "block", marginTop: 10, fontSize: 12 }}>節拍（每行一個）<textarea style={{ ...input, marginTop: 4, minHeight: 90 }} value={list(bible.episode.beats)} onChange={(e) => setBible((v) => ({ ...v, episode: { ...v.episode, beats: strings(e.target.value) } }))} /></label></div>
      {group("角色", "characters")}{group("地點", "locations")}{group("道具", "props")}
      <div style={card}><b style={{ fontSize: 13 }}>角色連續性規則</b><div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 9 }}>{([ ["目前狀態", "currentState"], ["不可違反", "prohibitions"], ["未解線索", "openThreads"] ] as const).map(([label, key]) => <label key={key} style={{ fontSize: 12 }}>{label}<textarea style={{ ...input, marginTop: 4, minHeight: 110 }} value={list(bible.continuity[key])} onChange={(e) => setBible((v) => ({ ...v, continuity: { ...v.continuity, [key]: strings(e.target.value) } }))} placeholder="每行一項" /></label>)}</div></div>
      <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><button type="button" onClick={() => void save()} disabled={busy} style={button()}>{busy ? "處理中…" : "儲存新草稿版本"}</button><span style={{ fontSize: 11, color: "var(--text-muted)" }}>目前引用 {currentAssetIds.length} 個素材；伺服器會驗證結構、租戶與不可變雜湊。</span></div>
    </div><aside style={{ ...card, position: "sticky", top: 12 }}><b>版本庫</b><div style={{ marginTop: 10, display: "grid", gap: 8 }}>{rows.length === 0 ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>尚未載入版本</span> : rows.map((row) => <div key={row.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 7, padding: 9 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}><span>{row.series_id} r{row.revision}</span><span style={{ color: row.status === "approved" ? "var(--green)" : "var(--text-muted)" }}>{row.status}</span></div><div style={{ fontSize: 10, color: "var(--text-muted)", margin: "5px 0" }}>{row.document_sha256.slice(0, 16)}…</div><div style={{ display: "flex", gap: 6 }}><button type="button" style={{ ...button("var(--bg-subtle)"), color: "var(--text-primary)", padding: "5px 7px" }} onClick={() => useRevision(row)}>開啟</button>{row.status === "draft" && <button type="button" style={{ ...button("var(--green)"), padding: "5px 7px" }} disabled={busy} onClick={() => void approve(row.id)}>核准</button>}</div></div>)}</div></aside></div>
  </div>;
}
