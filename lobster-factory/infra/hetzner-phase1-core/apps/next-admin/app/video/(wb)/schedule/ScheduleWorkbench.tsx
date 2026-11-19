"use client";
import { useEffect, useState } from "react";
import { buttonStyle, cardStyle, optionStyle } from "@/components/tools/panel-primitives";
import { taipeiParts } from "@/lib/content/topics/store";
import { LANE_LABEL, LANE_ORDER, approvedStartText, inLane, laneCounts, nextStep, topicLane, type LaneFilter } from "@/lib/content/topics/lanes";
import { shotsFromScript } from "../../../(shell)/tools/video/video-handoff";
import { useWorkbench, type Workbench } from "../workbench";

type Topic = { id: string; title: string; status: string; scheduled_for: string | null; last_error: string | null; version?: number; site_id?: string | null };
const STATUS: Record<string, string> = { proposed: "排隊・待確認", approved: "排隊", generating: "進行中・生成內容", drafted: "進行中・草稿已建立", waiting_video: "進行中・製作影片", embedded: "進行中・影片已嵌入", reviewed: "待決定發布", scheduled: "排隊・待發布", publishing: "進行中・發布中", published: "已發布", failed: "已停下", rejected: "已停下・未採用" };

/** The content tool's topics page opened on this topic's site, month and topic (TopicsBoard reads the query). */
const topicHref = (base: string, t: Topic) => {
  const q = new URLSearchParams();
  if (t.site_id) q.set("site", t.site_id);
  if (t.scheduled_for) q.set("month", taipeiParts(t.scheduled_for).month);
  q.set("topic", t.id);
  return `${base}?${q}`;
};
const taipei = (iso: string) => new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

/** One row's next step: the content tool's own PATCH (approve / reject / retry); a 409 means someone changed it first. */
export async function stepTopic(t: Pick<Topic, "id" | "version">, action: "approve" | "reject" | "retry"): Promise<string | null> {
  const res = await fetch(`/api/content/topics/${encodeURIComponent(t.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, version: t.version }) });
  if (res.status === 409) return "有人剛改過，已重新載入。";
  const j = await res.json().catch(() => ({ ok: false })) as { ok?: boolean; error?: string };
  return j.ok ? null : (j.error ?? `操作失敗（${res.status}）`);
}

export async function adoptTopic(workbench: Workbench, id: string, org: string) {
  const res = await fetch(`/api/video/projects?id=${encodeURIComponent(id)}`, { credentials: "same-origin" });
  if (!res.ok) throw Error("無法讀取這支影片");
  const { item } = await res.json();
  if (item?.organization_id !== org || item?.source !== "content_topic") throw Error("這不是這個品牌的排程影片");
  const scenes = item.brief_json?.videoScenes;
  if (!Array.isArray(scenes) || !scenes.length) throw Error("這支舊片沒有保存逐場景資料，可回專案卡查看與審片；後續排程生成的影片才可接手編輯。");
  const shots = shotsFromScript({ scenes });
  if (shots.length !== scenes.length) throw Error("場景資料不完整，未建立新的一集");
  return workbench.spine.create({ title: item.title, ratio: String(item.formats?.[0] || "16x9").replace("x", ":"), shots, characters: [], sourceProjectId: id });
}

export default function ScheduleWorkbench({ settingsHref }: { settingsHref: string | null }) {
  const workbench = useWorkbench();
  const [org, setOrg] = useState("");
  const [items, setItems] = useState<Topic[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [target, setTarget] = useState("");
  const [lane, setLane] = useState<LaneFilter>("all");
  useEffect(() => { setTarget(new URLSearchParams(location.search).get("project") || ""); }, []);
  async function load() {
    if (!workbench) return;
    setBusy(true); setError(""); setItems([]);
    try {
      const organizationId = (await workbench.loadCapabilities())?.mainSystem?.organizationId;
      if (!organizationId) throw Error("這個工作台沒有連上主系統");
      setOrg(organizationId);
      const res = await fetch(`/api/video/schedule?organizationId=${encodeURIComponent(organizationId)}`, { credentials: "same-origin" });
      if (!res.ok) throw Error("排程讀取失敗，請重試");
      setItems((await res.json()).items);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function step(t: Topic, action: "approve" | "reject" | "retry") {
    setBusy(true);
    let message: string | null = null;
    try { message = await stepTopic(t, action); } catch { message = "操作失敗，請重試"; }
    await load();
    if (message) setError(message);
  }
  useEffect(() => { void load(); }, [workbench]); // eslint-disable-line react-hooks/exhaustive-deps
  async function adopt() {
    const id = target;
    if (!workbench || !id) return;
    setBusy(true); setError("");
    try { await adoptTopic(workbench, id, org); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const now = new Date();
  const shown = inLane(items, lane, now);
  const counts = laneCounts(items, now);
  return <main style={{ padding: 24, color: "var(--text-primary)" }}>
    <h1>自動排程</h1><p>沿用內容工具的話題佇列，顯示這個品牌最近更新的 200 筆。設定與發布方式在內容工具管理。</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button style={buttonStyle()} disabled={busy} onClick={() => void load()}>重新整理</button>
      {settingsHref ? <a href={settingsHref} target="_blank" rel="noreferrer" style={buttonStyle()}>開啟內容排程設定</a> : <p>此帳號尚未開通內容工具，請由品牌管理者設定排程。</p>}
      {target && <button style={buttonStyle({ tone: "primary" })} disabled={busy || !org} onClick={() => void adopt()}>接手編輯</button>}
    </div>
    <p>接手編輯會建立工作台的一集；原排程仍依原設定運作。如需停止自動發布，先到內容排程設定調整。</p>
    {busy && <p>讀取中…</p>}{error && <p role="alert">{error}</p>}
    {!busy && !error && !items.length && <p>目前沒有話題排程。</p>}
    {items.length > 0 && <div role="group" aria-label="篩選" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
      {LANE_ORDER.map((l) => <button key={l} type="button" aria-pressed={lane === l} style={optionStyle(lane === l)} onClick={() => setLane(l)}>{LANE_LABEL[l]} {counts[l]}</button>)}
    </div>}
    {items.length > 0 && !shown.length && <p>這個分類沒有題目。</p>}
    {shown.map((t) => {
      const next = nextStep(t, now);
      const overdue = topicLane(t, now) === "overdue";
      const start = approvedStartText(t, now, t.scheduled_for ? taipei(t.scheduled_for) : "");
      const canAct = next && (next.action === "view" ? !!settingsHref : t.version !== undefined);
      return <article key={t.id} style={{ ...cardStyle(), padding: 16, marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}><h2 style={{ overflowWrap: "anywhere" }}>{t.title}</h2>
          <p>{overdue ? "過期・時間已過，還沒決定" : (STATUS[t.status] ?? "狀態未知")}{t.scheduled_for ? ` · ${taipei(t.scheduled_for)}` : ""}</p>
          {start && <p>{start}</p>}
          {t.last_error && <p>停下原因：{t.last_error}</p>}
        </div>
        {canAct && next && (next.action === "view"
          ? <a href={topicHref(settingsHref!, t)} target="_blank" rel="noreferrer" style={buttonStyle({ tone: "primary" })}>{next.label}</a>
          : <button type="button" style={buttonStyle({ tone: "primary" })} disabled={busy} onClick={() => void step(t, next.action as "approve" | "reject" | "retry")}>{next.label}</button>)}
      </article>;
    })}
  </main>;
}
