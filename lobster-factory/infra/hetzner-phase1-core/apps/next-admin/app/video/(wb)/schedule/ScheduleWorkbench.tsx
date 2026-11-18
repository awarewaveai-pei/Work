"use client";
import { useEffect, useState } from "react";
import { buttonStyle, cardStyle } from "@/components/tools/panel-primitives";
import { shotsFromScript } from "../../../(shell)/tools/video/video-handoff";
import { useWorkbench, type Workbench } from "../workbench";

type Topic = { id: string; title: string; status: string; scheduled_for: string | null; last_error: string | null };
const STATUS: Record<string, string> = { proposed: "排隊・待確認", approved: "排隊", generating: "進行中・生成內容", drafted: "進行中・草稿已建立", waiting_video: "進行中・製作影片", embedded: "進行中・影片已嵌入", reviewed: "待決定發布", scheduled: "排隊・待發布", published: "已發布", failed: "已停下", rejected: "已停下・未採用" };

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
  useEffect(() => { void load(); }, [workbench]); // eslint-disable-line react-hooks/exhaustive-deps
  async function adopt() {
    const id = target;
    if (!workbench || !id) return;
    setBusy(true); setError("");
    try { await adoptTopic(workbench, id, org); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
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
    {items.map((t) => <article key={t.id} style={{ ...cardStyle(), padding: 16, marginTop: 12 }}><h2>{t.title}</h2>
      <p>{STATUS[t.status] ?? "狀態未知"}{t.scheduled_for ? ` · ${new Date(t.scheduled_for).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}` : ""}</p>
      {t.last_error && <p>停下原因：{t.last_error}</p>}
    </article>)}
  </main>;
}
