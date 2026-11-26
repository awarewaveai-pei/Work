"use client";
// Auto-content pages' body, one view per page (R8: 五步驟 is a sub-page of 題目 in the side menu): topics = one site's month
// of topics, the list on the left and the clicked topic on the right (same layout as /ops/schedules); steps = one site's
// five steps. The site is the client rail's current one (ADR 020, useClientContext("site")): the page draws no picker of
// its own, never falls back to a first site, and reads nothing until a site is picked. ?month=&topic= (the workbench's
// 自動排程 link, beside ?site=) open that month and topic.
// Buttons and checkboxes only, no dropdowns (memory feedback_no_dropdowns_multiselect). Every change goes through
// /api/content/topics*, which checks the site's organization; a stale page gets 409 and reloads.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAX_BULK_TOPICS, NEXT, TOPIC_FORMATS, canReschedule, daysIn, taipeiParts, type Topic, type TopicFormat, type TopicStatus } from "@/lib/content/topics/store";
import { costBasisNote, planCostTwd, subRoadNote, topicShownTwd } from "@/lib/content/topics/cost";
import { DAILY_START_CAP, makesNow } from "@/lib/content/topics/tick";
import { GridPicker } from "@/components/tools/GridPicker";
import type { TopicReview } from "@/lib/content/topics/review";
import type { TopicArtifacts } from "@/lib/content/topics/make";
import { autoPublishes, youtubePrivacy, type SiteContentDefaults } from "@/lib/content/brand-voice";
import type { ManagedSite } from "@/app/api/content/sites/route";
import type { OverviewData } from "@/lib/content/topics/overview-load";
import { LANE_LABEL, LANE_ORDER, approvedStartText, draftUrl, inLane, laneCounts, nextStep, pendingYoutubePostId, publishConfirm, publishNote, publishTargets,
  socialDraftsUrl, topicLane, youtubePrivacyMismatch, type DraftPrivacy, type LaneFilter, type PublishConfirm } from "@/lib/content/topics/lanes";
import { FlowCells } from "./AutoContentOverview";
import { useClientContext } from "@/lib/client-context/use-client-context";

const T = {
  noSites: "還沒有可用的客戶網站，先到「客戶網站」加一個。",
  current: "目前：",
  noSiteSettings: "讀不到這個網站的設定（網站沒有連到客戶，或沒有權限），五個步驟無法顯示。",
  plan: "AI 提案本月題目",
  planning: "AI 規劃中…",
  approveSel: "核准所選",
  rejectSel: "退回所選",
  laneEmpty: "這個分類沒有題目。",
  empty: "這個月還沒有題目。按「AI 提案本月題目」，或在下面自己加一題。",
  pick: "點左邊一個題目，這裡會顯示細節。",
  add: "加題目",
  addOneMode: "加一題",
  addManyMode: "一次加多題",
  manyHint: "一行一個關鍵字",
  manyPlaceholder: "例：藝術治療是什麼\n焦慮時怎麼自我安撫\n親子溝通三個小技巧",
  fromDay: "從幾號開始",
  tooMany: `一次最多 ${MAX_BULK_TOPICS} 題，請刪掉幾行。`,
  addMany: (n: number) => `加 ${n} 題`,
  manyCost: (twd: number, basis: string) => `加題目免費；排程做的時候每題約 NT$${twd}（${basis}）`,
  manyDone: (n: number, skipped: string[]) => `加了 ${n} 題${skipped.length ? `；已排過略過：${skipped.join("、")}` : ""}。`,
  addBtn: "加入",
  title: "標題",
  keyword: "搜尋關鍵字",
  angle: "切入角度（選填）",
  formats: "要做的格式（點了就存）",
  atLeastOne: "至少要選一種格式。",
  source: "來源",
  error: "上次失敗原因",
  reload: "有人剛改過，已重新載入。",
  kbHint: "從知識庫的資料夾加題目（點一下會填進上面）：",
  fromKb: "來源：知識庫",
  start: "核准並開始",
  started: "已開始製作，約 2 分鐘後按上個月／下個月再回來就看得到草稿。",
  // what starting makes follows the topic's formats, like its price (topicCostTwd)
  startHint: (f: TopicFormat[], auto: boolean, cap: number) => `立刻做成 ${[f.includes("article") && "WordPress 草稿", f.includes("social") && "社群草稿"].filter(Boolean).join("和")}，${auto ? "檢查全部通過就自動發布（網站設定：AI 審核後自動發布）" : "不會發布（網站設定：人工審核）"}；每天最多開始 ${cap} 題（在排程頁 Schedules 的「自動內容管線」改）。`,
  when: "排定時間（台北）",
  hour: "時間",
  pickDay: "選日期",
  pickHour: "選台北時間",
  saveWhen: "儲存時間",
  whenFixed: "製作中、已審核、正在發布或已發布，時間不能改。",
  movedTo: (m: string) => `已改到 ${m}，切到那個月就看得到。`,
  review: "規則審核",
  wpDraft: "打開 WordPress 草稿",
  socialDrafts: "打開社群草稿（社群工具）",
  publish: "發布",
  publishHint: "按了才會發出去；誰按的、什麼時候按的會記在題目上。",
  fixDraft: "到社群草稿修改",
  publishNothing: "這個題目沒有可以發布的草稿。",
  publishing: "已開始發布；YouTube 上線後才會發文章，約 5–10 分鐘後重新整理看狀態。",
  readingDraft: "讀取草稿設定…",
  readTimeout: "讀不到草稿設定，請再按一次。",
  draftChanged: "YouTube 草稿的設定剛改過，下面已更新，請再確認一次。",
  confirmPublish: "確定發布",
  cancel: "取消",
};
/** How long 「發布」 waits for the YouTube draft's setting before giving up (no confirmation, nothing sent). */
export const PUBLISH_READ_TIMEOUT_MS = 8000;
/** A search-run folder is named "<keyword> <YYYYMMDDHHmm>" (lib/collect/sinks/kb.ts); the keyword is the topic. */
const folderKeyword = (name: string) => name.replace(/\s*\d{12}$/, "").trim() || name;
const STATUS: Record<TopicStatus, [string, string]> = {
  proposed: ["提案", "var(--text-muted)"], approved: ["已核准", "var(--accent-text)"], rejected: ["已退回", "var(--text-muted)"],
  generating: ["製作中", "var(--yellow)"], drafted: ["已有草稿", "var(--yellow)"], waiting_video: ["等影片", "var(--yellow)"],
  embedded: ["影片已嵌入", "var(--yellow)"], reviewed: ["已審核", "var(--green)"], scheduled: ["已排程", "var(--green)"],
  publishing: ["發布中", "var(--yellow)"], published: ["已發布", "var(--green)"], failed: ["失敗", "var(--red)"],
};
const FORMAT: Record<TopicFormat, string> = { article: "文章", social: "社群", video: "影片", youtube: "YouTube" };
const SOURCE: Record<Topic["source"], string> = { trending: "熱門話題", kb: "知識庫", plan: "AI 規劃", manual: "手動" };
const ACTION_FOR: Partial<Record<TopicStatus, Array<[string, string]>>> = {
  proposed: [["approve", "核准"], ["reject", "退回"]],
  approved: [["reopen", "改回提案"]],
  rejected: [["reopen", "重新提案"]],
  failed: [["retry", "重試"]],
  reviewed: [["redo", "退回重做"]],
};

type Site = ManagedSite;
const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 };
const chip = (on: boolean): React.CSSProperties => ({
  padding: "4px 10px", borderRadius: 999, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, cursor: "pointer",
  background: on ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent", color: "var(--text-primary)", fontSize: "var(--font-size-sm)",
});
/** The four format toggles (add form and detail panel): selected ones are filled and ticked, with aria-pressed. */
function FormatButtons({ value, disabled, onToggle }: { value: readonly TopicFormat[]; disabled?: boolean; onToggle: (f: TopicFormat) => void }) {
  return (
    <>
      {TOPIC_FORMATS.map((f) => {
        const on = value.includes(f);
        return (
          <button key={f} type="button" aria-pressed={on} disabled={disabled} onClick={() => onToggle(f)}
            style={{ ...chip(on), ...(on ? { background: "var(--accent)", color: "var(--bg-card)", fontWeight: 600 } : {}), ...(disabled ? { cursor: "default", opacity: 0.7 } : {}) }}>
            {on ? "✓ " : ""}{FORMAT[f]}
          </button>
        );
      })}
    </>
  );
}
const toggle = (list: readonly TopicFormat[], f: TopicFormat) => (list.includes(f) ? list.filter((x) => x !== f) : [...list, f]);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const shiftMonth = (m: string, by: number) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
/** "12日 09:00" in Taipei time, or "—". */
const whenText = (t: Topic) => {
  if (!t.scheduled_for) return "—";
  const p = taipeiParts(t.scheduled_for);
  return `${p.day}日 ${String(p.hour).padStart(2, "0")}:00`;
};
/** A new topic starts today (Taipei) in the month being looked at, at the next hour once 09:00 is past; another month starts on the 1st at 09:00. */
const addDefaults = (month: string, now: Date) => {
  const p = taipeiParts(now.toISOString());
  if (p.month !== month) return { day: 1, hour: 9 };
  // after 22:xx today has no hour left: tomorrow 09:00 (the last day of the month keeps 23:00)
  if (p.hour >= 22) return p.day < daysIn(month) ? { day: p.day + 1, hour: 9 } : { day: p.day, hour: 23 };
  return { day: p.day, hour: Math.max(9, p.hour + 1) };
};
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const dayText = (d: number) => `${d} 日`;
const daysOf = (month: string) => Array.from({ length: daysIn(month) }, (_, i) => i + 1);

export type TopicsView = "topics" | "steps";
/** Shown until the client rail has a site (nothing is read before that). */
export const PICK_SITE_FIRST = "在客戶欄選客戶和網站，這裡就會顯示。";

export function TopicsBoard({ overview, scheduleFor, view = "topics" }: {
  overview: OverviewData; scheduleFor?: (orgSlug: string) => ReactNode; view?: TopicsView;
}) {
  const ctx = useClientContext("site");
  const siteId = ctx.status === "ok" ? ctx.site ?? "" : "";
  /** A site saved in step ③/⑤ replaces the rail's copy of it until the page reloads. */
  const [saved, setSaved] = useState<Record<string, Site>>({});
  const [month, setMonth] = useState(thisMonth());
  const [topics, setTopics] = useState<Topic[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selId, setSelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [draftFormats, setDraftFormats] = useState<TopicFormat[] | null>(null);
  const [add, setAdd] = useState<{ day: number | null; hour: number | null; title: string; keyword: string; angle: string; formats: TopicFormat[] }>({ day: null, hour: null, title: "", keyword: "", angle: "", formats: ["article", "social"] });
  /** The selected topic's time being edited (Taipei); null = unchanged. */
  const [draftWhen, setDraftWhen] = useState<{ month: string; day: number; hour: number } | null>(null);
  const [dailyCap, setDailyCap] = useState(DAILY_START_CAP);
  const [lane, setLane] = useState<LaneFilter>("all");
  const [many, setMany] = useState(false);
  const [lines, setLines] = useState("");
  const [fromFolder, setFromFolder] = useState<{ id: string; name: string } | null>(null);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  /** Each reviewed topic's YouTube draft privacy, read by the topics API from the draft itself (N6 confirmation). */
  const [ytPrivacy, setYtPrivacy] = useState<Record<string, DraftPrivacy>>({});
  /** 「發布」 in progress: reading the draft's setting, then the in-page confirmation (one topic at a time). */
  const [pub, setPub] = useState<{ id: string; confirm: (PublishConfirm & { topic: Topic; privacy: DraftPrivacy }) | null } | null>(null);
  /** Bumped by cancel / picking another topic, so a read that finishes late opens no confirmation. */
  const pubReq = useRef(0);

  // a link from the workbench's 自動排程 (?site=&month=&topic=): the rail takes ?site=, this page the month and the topic,
  // which opens only if the current site's list holds it (topic ids are unique)
  const wantTopic = useRef<string | null>(null);
  const looking = useRef("");
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const m = q.get("month"), tp = q.get("topic");
    if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) setMonth(m);
    if (tp) wantTopic.current = tp;
  }, []);

  const load = useCallback(async () => {
    if (!siteId) return;
    const key = `${siteId}|${month}`;
    looking.current = key;
    const r = await fetch(`/api/content/topics?siteId=${encodeURIComponent(siteId)}&month=${month}&folders=1`);
    const j = await r.json() as { ok: boolean; topics?: Topic[]; folders?: Array<{ id: string; name: string }>; dailyCap?: number; youtubePrivacy?: Record<string, DraftPrivacy>; error?: string };
    if (looking.current !== key) return;   // the site or month changed while this was loading
    if (!j.ok) { setNote(j.error ?? `讀取失敗（${r.status}）`); return; }
    setTopics(j.topics ?? []);
    setYtPrivacy(j.youtubePrivacy ?? {});
    const want = wantTopic.current;
    if (want && j.topics?.some((x) => x.id === want)) { setSelId(want); wantTopic.current = null; }
    if (typeof j.dailyCap === "number") setDailyCap(j.dailyCap);
    setFolders(j.folders ?? []);
    setChecked(new Set());
  }, [siteId, month]);
  useEffect(() => { setSelId(""); setNote(""); pubReq.current += 1; setPub(null); void load(); }, [load]);

  const now = new Date();
  const addDef = addDefaults(month, now);
  const addDay = Math.min(add.day ?? addDef.day, daysIn(month));
  const addHour = add.hour ?? addDef.hour;
  const shown = inLane(topics, lane, now);
  const laneN = laneCounts(topics, now);
  const sel = topics.find((t) => t.id === selId);
  useEffect(() => { setDraftFormats(null); setDraftWhen(null); }, [selId]);
  const selYoutube = sel?.status === "reviewed" ? pendingYoutubePostId(sel) : null;
  const counts = useMemo(() => {
    const c: Partial<Record<TopicStatus, number>> = {};
    for (const t of topics) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [topics]);

  async function act(t: Topic, action: string, formats?: TopicFormat[], when?: { month: string; day: number; hour: number }): Promise<boolean> {
    const r = await fetch(`/api/content/topics/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, version: t.version, ...(formats ? { formats } : {}), ...(when ?? {}) }),
    });
    if (r.status === 409) { setNote(T.reload); return false; }
    const j = await r.json() as { ok: boolean; error?: string };
    if (!j.ok) { setNote(j.error ?? `失敗（${r.status}）`); return false; }
    return true;
  }

  async function batch(action: "approve" | "reject") {
    setBusy(true); setNote("");
    try {
      for (const t of topics.filter((x) => checked.has(x.id) && x.status === "proposed")) await act(t, action);
    } finally { await load(); setBusy(false); }
  }

  /** The button on a row: the same actions as the detail panel. */
  async function rowStep(t: Topic, action: "approve" | "reject" | "retry" | "publish") {
    if (action === "publish") { pick(t.id); await publish(t); return; }
    setBusy(true); setNote("");
    try { await act(t, action); } finally { await load(); setBusy(false); }
  }

  /** The topic's YouTube draft privacy as the topics API reads it now (null = could not be read; "timeout" = no answer
   *  within PUBLISH_READ_TIMEOUT_MS). */
  async function readPrivacy(topicId: string): Promise<DraftPrivacy | "timeout"> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), PUBLISH_READ_TIMEOUT_MS);
    try {
      const r = await fetch(`/api/content/topics?siteId=${encodeURIComponent(siteId)}&month=${month}`, { signal: ctl.signal });
      const j = await r.json() as { ok: boolean; youtubePrivacy?: Record<string, DraftPrivacy> };
      if (!j.ok) return null;
      setYtPrivacy(j.youtubePrivacy ?? {});
      return j.youtubePrivacy?.[topicId] ?? null;
    } catch { return ctl.signal.aborted ? "timeout" : null; } finally { clearTimeout(timer); }
  }

  /** Selecting another topic drops a pending 「發布」 confirmation (its late read included). */
  function pick(id: string) {
    if (id !== selId) { pubReq.current += 1; setPub(null); }
    setSelId(id);
  }

  /** N6 「發布」 step 1: the button says it is reading at once, then the confirmation opens in the topic's card naming
   *  where it goes. YouTube's privacy is read from the draft at this moment (fixed when the draft was made), never taken
   *  from the site's current setting. A read past PUBLISH_READ_TIMEOUT_MS opens nothing and sends nothing. */
  async function publish(t: Topic) {
    const req = ++pubReq.current;
    const ytId = pendingYoutubePostId(t);
    // busy before the read: a second press while it loads would open a second confirmation and a 409 over the success
    setBusy(true); setNote(""); setPub({ id: t.id, confirm: null });
    try {
      // read again at the press: the draft may have been changed in the social tool since the list was loaded
      const privacy = ytId ? await readPrivacy(t.id) : null;
      if (req !== pubReq.current) return;
      if (privacy === "timeout") { setPub(null); setNote(T.readTimeout); return; }
      const to = publishTargets(t, privacy);
      if (!to.length) { setPub(null); setNote(T.publishNothing); return; }
      const mismatch = ytId ? youtubePrivacyMismatch(privacy, youtubePrivacy(site?.contentDefaults)) : null;
      setPub({ id: t.id, confirm: { ...publishConfirm(t.title, to, (t.review as TopicReview | null)?.pass !== true, mismatch), topic: t, privacy } });
    } finally { setBusy(false); }
  }

  function cancelPublish() { pubReq.current += 1; setPub(null); }

  /** N6 「發布」 step 2 (確定發布): the route records who pressed it. */
  async function sendPublish() {
    if (!pub?.confirm) return;
    const { topic: t, privacy: shown } = pub.confirm;
    const { id, version } = t;
    setBusy(true); setNote("");
    // the draft may have been edited (the link in the confirmation) while it was open: send only what was shown
    if (pendingYoutubePostId(t)) {
      const privacy = await readPrivacy(id);
      if (privacy === "timeout") { setNote(T.readTimeout); setBusy(false); return; }
      if (privacy !== shown) {
        const mismatch = youtubePrivacyMismatch(privacy, youtubePrivacy(site?.contentDefaults));
        setPub({ id, confirm: { ...publishConfirm(t.title, publishTargets(t, privacy), (t.review as TopicReview | null)?.pass !== true, mismatch), topic: t, privacy } });
        setNote(T.draftChanged); setBusy(false); return;
      }
    }
    setPub(null);
    try {
      const r = await fetch(`/api/content/topics/${id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }) });
      const j = await r.json().catch(() => ({ ok: false })) as { ok: boolean; error?: string };
      setNote(j.ok ? T.publishing : r.status === 409 && !j.error?.startsWith("只有") && !j.error?.startsWith("要先在排程頁") ? T.reload : (j.error ?? `失敗（${r.status}）`));
    } finally { await load(); setBusy(false); }
  }

  /** A format button saves at once (same PATCH "formats", raced by version); a failure goes back to the stored formats
   *  with the reason in the note. The last format cannot be taken off. */
  async function saveFormat(f: TopicFormat) {
    if (!sel) return;
    const n = toggle(draftFormats ?? sel.formats, f);
    if (!n.length) { setNote(T.atLeastOne); return; }
    setBusy(true); setNote(""); setDraftFormats(n);
    try { await act(sel, "formats", n); } finally { await load(); setDraftFormats(null); setBusy(false); }
  }

  async function one(action: string, formats?: TopicFormat[]) {
    if (!sel) return;
    setBusy(true); setNote("");
    try { await act(sel, action, formats); } finally { await load(); setBusy(false); }
  }

  async function saveWhen() {
    if (!sel || !draftWhen) return;
    setBusy(true); setNote("");
    try {
      const ok = await act(sel, "schedule", undefined, draftWhen);
      if (ok && draftWhen.month !== month) setNote(T.movedTo(draftWhen.month));
    } finally { await load(); setBusy(false); }
  }

  async function start() {
    if (!sel) return;
    setBusy(true); setNote("");
    try {
      const r = await fetch(`/api/content/topics/${sel.id}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: sel.version }) });
      const j = await r.json().catch(() => ({ ok: false })) as { ok: boolean; error?: string; code?: string };
      setNote(j.ok ? T.started : (j.error ?? j.code ?? `失敗（${r.status}）`));
    } finally { await load(); setBusy(false); }
  }

  async function plan() {
    setBusy(true); setNote("");
    try {
      const r = await fetch("/api/content/topics/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId, month }) });
      const j = await r.json() as { ok: boolean; added?: number; error?: string };
      setNote(j.ok ? `加了 ${j.added} 個題目。` : (j.error ?? `失敗（${r.status}）`));
    } finally { await load(); setBusy(false); }
  }

  async function addOne() {
    if (!add.title.trim() || !add.keyword.trim()) return;
    setBusy(true); setNote("");
    try {
      const r = await fetch("/api/content/topics", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, month, ...add, day: addDay, hour: addHour, ...(fromFolder ? { source: "kb", sourceRef: { folder_id: fromFolder.id, text: fromFolder.name } } : {}) }) });
      const j = await r.json() as { ok: boolean; error?: string };
      if (j.ok) { setAdd({ day: null, hour: null, title: "", keyword: "", angle: "", formats: ["article", "social"] }); setFromFolder(null); }
      else setNote(j.error ?? `失敗（${r.status}）`);
    } finally { await load(); setBusy(false); }
  }

  const keywords = [...new Set(lines.split("\n").map((l) => l.trim()).filter(Boolean))];

  async function addMany() {
    if (!keywords.length || keywords.length > MAX_BULK_TOPICS) return;
    setBusy(true); setNote("");
    try {
      const r = await fetch("/api/content/topics", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, month, keywords, fromDay: addDay, hour: addHour, formats: add.formats }) });
      const j = await r.json() as { ok: boolean; added?: number; skipped?: string[]; error?: string };
      if (j.ok) { setNote(T.manyDone(j.added ?? 0, j.skipped ?? [])); setLines(""); }
      else setNote(j.error ?? `失敗（${r.status}）`);
    } finally { await load(); setBusy(false); }
  }

  if (!siteId) return <p style={{ color: "var(--text-muted)" }}>{ctx.status === "loading" ? "…" : PICK_SITE_FIRST}</p>;
  // the numbers are read per client: until they are for the rail's client (the server page re-renders on ?org=), wait
  if (overview.organizationId !== ctx.org) return <p style={{ color: "var(--text-muted)" }}>…</p>;
  if (!overview.rows.length) return <p style={{ color: "var(--text-muted)" }}>{T.noSites}</p>;
  if (!ctx.sites && !ctx.sitesFailed && !saved[siteId]) return <p style={{ color: "var(--text-muted)" }}>…</p>;
  const editable = sel && ["proposed", "approved"].includes(sel.status);
  const selWhen = sel?.scheduled_for ? taipeiParts(sel.scheduled_for) : { month, day: 1, hour: 9 };
  const when = draftWhen ?? selWhen;
  // a day past the end of the month just switched to (31 -> November) becomes its last day
  const setWhen = (w: { month: string; day: number; hour: number }) => setDraftWhen({ ...w, day: Math.min(w.day, daysIn(w.month)) });
  const formats = draftFormats ?? sel?.formats ?? [];
  const selPub = sel && pub?.id === sel.id ? pub : null;
  const site = saved[siteId] ?? ctx.sites?.find((x) => x.id === siteId);
  const siteRow = overview.rows.find((r) => r.siteId === siteId);
  // N3: the median of this brand's recent finished topics once there are enough, else the price list; the page names which
  const priceOf = (f?: readonly string[]) => topicShownTwd(f, siteRow ? overview.actual?.[siteRow.organizationId] : null, site?.contentDefaults);
  // K7: a site whose article starts on a subscription says what that costs and what the API fallback can cost
  const subNote = (f: readonly string[]) => (f.includes("article") ? subRoadNote(site?.contentDefaults) : null);
  const planButton = (
    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void plan()} style={{ whiteSpace: "normal" }}>
      {busy ? T.planning : `${T.plan}（約 NT$${planCostTwd()}）`}
    </button>
  );

  const noteLine = note && <p style={{ margin: 0, color: "var(--yellow)", fontSize: "var(--font-size-sm)" }}>{note}</p>;

  if (view === "steps") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        {noteLine}
        {!(site && siteRow) && <p style={{ margin: 0, color: "var(--text-muted)" }}>{T.noSiteSettings}</p>}
        {siteRow && site && (
          <FlowCells site={site} row={siteRow} cell={overview.cells[siteId]} topics={topics} month={month} schedule={site.org_slug && scheduleFor ? scheduleFor(site.org_slug) : null}
            planButton={planButton} onSiteSaved={(u) => setSaved((m) => ({ ...m, [u.id]: u }))} />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
      <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
        {T.current}<strong style={{ color: "var(--text-primary)" }}>{siteRow ? `${siteRow.orgName}・${siteRow.siteName}` : site?.name ?? "—"}</strong>
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" onClick={() => setMonth(shiftMonth(month, -1))}>‹ 上個月</button>
        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{month}</strong>
        <button type="button" className="btn btn-secondary" onClick={() => setMonth(shiftMonth(month, 1))}>下個月 ›</button>
      </div>
      <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>
        {(Object.keys(STATUS) as TopicStatus[]).filter((s) => counts[s]).map((s) => `${STATUS[s][0]} ${counts[s]}`).join(" · ") || "—"}
      </p>
      {noteLine}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "999 1 480px", minWidth: 0, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary" disabled={busy || !checked.size} onClick={() => void batch("approve")}>{T.approveSel}</button>
            <button type="button" className="btn btn-ghost" disabled={busy || !checked.size} onClick={() => void batch("reject")}>{T.rejectSel}</button>
          </div>
          <div role="group" aria-label="篩選" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {LANE_ORDER.map((l) => <button key={l} type="button" aria-pressed={lane === l} style={chip(lane === l)} onClick={() => setLane(l)}>{LANE_LABEL[l]} {laneN[l]}</button>)}
          </div>
          <div style={{ ...card, padding: 0 }}>
            {!topics.length && <p style={{ margin: 0, padding: 14, color: "var(--text-muted)" }}>{T.empty}</p>}
            {!!topics.length && !shown.length && <p style={{ margin: 0, padding: 14, color: "var(--text-muted)" }}>{T.laneEmpty}</p>}
            {shown.map((t) => (
              <div key={t.id} onClick={() => pick(t.id)}
                style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "9px 12px",
                  borderTop: "1px solid var(--border)", cursor: "pointer", background: t.id === selId ? "var(--bg-hover)" : undefined }}>
                <input type="checkbox" aria-label={t.title} disabled={t.status !== "proposed"} checked={checked.has(t.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setChecked((c) => { const n = new Set(c); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: "var(--text-primary)", overflowWrap: "anywhere" }}>{t.title}</span>
                  <span style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    {whenText(t)} · {t.formats.map((f) => FORMAT[f]).join("、")} · {SOURCE[t.source]}
                  </span>
                  {approvedStartText(t, now, whenText(t)) && <span style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--accent-text)" }}>{approvedStartText(t, now, whenText(t))}</span>}
                  {publishNote(t) && <span style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--yellow)" }}>{publishNote(t)}</span>}
                </span>
                <span style={{ display: "grid", justifyItems: "end", gap: 4 }}>
                  <span style={{ fontSize: "var(--font-size-xs)", color: STATUS[t.status][1], whiteSpace: "nowrap" }}>{topicLane(t, now) === "overdue" ? "過期" : STATUS[t.status][0]}</span>
                  {nextStep(t, now) && <button type="button" className="btn btn-secondary" disabled={busy} onClick={(e) => { e.stopPropagation(); void rowStep(t, nextStep(t, now)!.action); }}>{pub?.id === t.id && !pub.confirm ? T.readingDraft : nextStep(t, now)!.label}</button>}
                </span>
              </div>
            ))}
          </div>

          <div style={{ ...card, display: "grid", gap: 8 }}>
            <div className="section-title" style={{ margin: 0 }}>{T.add}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={chip(!many)} onClick={() => setMany(false)}>{T.addOneMode}</button>
              <button type="button" style={chip(many)} onClick={() => setMany(true)}>{T.addManyMode}</button>
            </div>
            {many && (
              <>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>{T.manyHint}</div>
                <textarea id="topic-add-many" rows={6} placeholder={T.manyPlaceholder} value={lines} onChange={(e) => setLines(e.target.value)} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--font-size-sm)" }}>{T.fromDay}</span>
                  <GridPicker value={addDay} options={daysOf(month)} format={dayText} label={T.pickDay} columns={7} disabled={busy} onChange={(d) => setAdd({ ...add, day: d })} />
                  <GridPicker value={addHour} options={HOURS} format={hh} label={T.pickHour} disabled={busy} onChange={(h) => setAdd({ ...add, hour: h })} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <FormatButtons value={add.formats} onToggle={(f) => setAdd({ ...add, formats: toggle(add.formats, f).length ? toggle(add.formats, f) : add.formats })} />
                  <button type="button" className="btn btn-secondary" disabled={busy || !keywords.length || keywords.length > MAX_BULK_TOPICS} onClick={() => void addMany()}>{T.addMany(keywords.length)}</button>
                </div>
                {keywords.length > MAX_BULK_TOPICS && <p style={{ margin: 0, color: "var(--yellow)", fontSize: "var(--font-size-sm)" }}>{T.tooMany}</p>}
                <p style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{T.manyCost(priceOf(add.formats).usual, costBasisNote(priceOf(add.formats).basis, priceOf(add.formats).n))}{subNote(add.formats) && `。${subNote(add.formats)}`}</p>
              </>
            )}
            {!many && <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <GridPicker value={addDay} options={daysOf(month)} format={dayText} label={T.pickDay} columns={7} disabled={busy} onChange={(d) => setAdd({ ...add, day: d })} />
              <GridPicker value={addHour} options={HOURS} format={hh} label={T.pickHour} disabled={busy} onChange={(h) => setAdd({ ...add, hour: h })} />
              <input id="topic-add-title" placeholder={T.title} value={add.title} style={{ flex: "2 1 220px", minWidth: 0 }} onChange={(e) => setAdd({ ...add, title: e.target.value })} />
              <input id="topic-add-keyword" placeholder={T.keyword} value={add.keyword} style={{ flex: "1 1 160px", minWidth: 0 }} onChange={(e) => setAdd({ ...add, keyword: e.target.value })} />
            </div>
            <input id="topic-add-angle" placeholder={T.angle} value={add.angle} onChange={(e) => setAdd({ ...add, angle: e.target.value })} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <FormatButtons value={add.formats} onToggle={(f) => setAdd({ ...add, formats: toggle(add.formats, f).length ? toggle(add.formats, f) : add.formats })} />
              <button type="button" className="btn btn-secondary" disabled={busy || !add.title.trim() || !add.keyword.trim()} onClick={() => void addOne()}>{T.addBtn}</button>
            </div>
            {fromFolder && <p style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{T.fromKb}：{fromFolder.name}</p>}
            {folders.length > 0 && (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>{T.kbHint}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {folders.slice(0, 30).map((f) => <button key={f.id} type="button" style={chip(fromFolder?.id === f.id)}
                    onClick={() => { const k = folderKeyword(f.name); setFromFolder(f); setAdd({ ...add, title: k, keyword: k }); }}>{f.name}</button>)}
                </div>
              </div>
            )}
            </>}
          </div>
        </div>

        <aside style={{ ...card, flex: "1 1 320px", minWidth: 0, display: "grid", gap: 10 }}>
          {!sel && <p style={{ margin: 0, color: "var(--text-muted)" }}>{T.pick}</p>}
          {sel && (
            <>
              <div>
                <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{sel.title}</div>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>{sel.keyword} · {whenText(sel)} · <span style={{ color: STATUS[sel.status][1] }}>{STATUS[sel.status][0]}</span></div>
              </div>
              {sel.angle && <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>{sel.angle}</p>}
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: "var(--font-size-sm)" }}>{T.when}</div>
                {canReschedule(sel, new Date()) ? (
                  <>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" className="btn btn-ghost" disabled={busy} aria-label="上個月" onClick={() => setWhen({ ...when, month: shiftMonth(when.month, -1) })}>‹</button>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{when.month}</span>
                      <button type="button" className="btn btn-ghost" disabled={busy} aria-label="下個月" onClick={() => setWhen({ ...when, month: shiftMonth(when.month, 1) })}>›</button>
                      <GridPicker value={when.day} options={daysOf(when.month)} format={dayText} label={T.pickDay} columns={7} disabled={busy} onChange={(d) => setWhen({ ...when, day: d })} />
                      <GridPicker value={when.hour} options={HOURS} format={hh} label={T.pickHour} disabled={busy} onChange={(h) => setWhen({ ...when, hour: h })} />
                    </div>
                    {draftWhen && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void saveWhen()}>{T.saveWhen}</button>}
                  </>
                ) : <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{T.whenFixed}</span>}
              </div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
                {T.source}：{SOURCE[sel.source]}{typeof sel.source_ref.text === "string" && sel.source_ref.text ? `（${sel.source_ref.text}）` : ""}
                {typeof sel.source_ref.score === "number" && <>；每日熱題相關分數 {sel.source_ref.score}{typeof sel.source_ref.reason === "string" && sel.source_ref.reason ? `：${sel.source_ref.reason}` : ""}</>}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: "var(--font-size-sm)" }}>{T.formats}</div>
                <div role="group" aria-label={T.formats} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <FormatButtons value={formats} disabled={!editable || busy} onToggle={(f) => void saveFormat(f)} />
                </div>
              </div>
              {sel.last_error && <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--red)" }}>{T.error}：{sel.last_error}</p>}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: "var(--font-size-sm)" }}>
                {draftUrl(sel) && <a href={draftUrl(sel)!} target="_blank" rel="noreferrer">{T.wpDraft}</a>}
                {((sel.artifacts as TopicArtifacts).social?.post_id || (sel.artifacts as TopicArtifacts).social?.youtube_post_id || (sel.artifacts as TopicArtifacts).social?.link_in_comment?.length) &&
                  <a href={socialDraftsUrl(sel.organization_id)} target="_blank" rel="noreferrer">{T.socialDrafts}</a>}
              </div>
              {sel.status === "reviewed" && (
                <div style={{ display: "grid", gap: 4 }}>
                  {selYoutube && sel.id in ytPrivacy && youtubePrivacyMismatch(ytPrivacy[sel.id], youtubePrivacy(site?.contentDefaults)) && (
                    <span role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--yellow)" }}>
                      {youtubePrivacyMismatch(ytPrivacy[sel.id], youtubePrivacy(site?.contentDefaults))}{" "}
                      <a href={socialDraftsUrl(sel.organization_id)} target="_blank" rel="noreferrer">{T.fixDraft}</a>
                    </span>
                  )}
                  {selPub?.confirm ? (
                    <div role="region" aria-label={T.confirmPublish} style={{ ...card, display: "grid", gap: 6, borderColor: "var(--accent)", fontSize: "var(--font-size-sm)" }}>
                      <strong style={{ color: "var(--text-primary)" }}>{selPub.confirm.question}</strong>
                      <ol style={{ margin: 0, paddingLeft: 20 }}>{selPub.confirm.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                      {selPub.confirm.reminder && (
                        <span style={{ color: "var(--yellow)" }}>{selPub.confirm.reminder}{" "}
                          <a href={socialDraftsUrl(sel.organization_id)} target="_blank" rel="noreferrer">{T.fixDraft}</a></span>
                      )}
                      {selPub.confirm.reviewWarning && <span style={{ color: "var(--red)" }}>{selPub.confirm.reviewWarning}</span>}
                      <span style={{ color: "var(--text-muted)" }}>{selPub.confirm.closing}</span>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void sendPublish()}>{T.confirmPublish}</button>
                        <button type="button" className="btn btn-ghost" disabled={busy} onClick={cancelPublish}>{T.cancel}</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void publish(sel)}>{selPub ? T.readingDraft : T.publish}</button>
                  )}
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{T.publishHint}</span>
                </div>
              )}
              {sel.review && (
                <div style={{ display: "grid", gap: 4, fontSize: "var(--font-size-sm)" }}>
                  <div>{T.review}：<span style={{ color: (sel.review as TopicReview).pass ? "var(--green)" : "var(--red)" }}>{(sel.review as TopicReview).pass ? "通過" : "沒通過"}</span></div>
                  {((sel.review as TopicReview).checks ?? []).map((c) => (
                    <div key={c.name} style={{ color: c.pass ? "var(--text-muted)" : "var(--red)" }}>{c.pass ? "✓" : "✗"} {c.detail}</div>
                  ))}
                </div>
              )}
              {["proposed", "approved"].includes(sel.status) && makesNow(sel) && (
                <div style={{ display: "grid", gap: 4 }}>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void start()} style={{ whiteSpace: "normal" }}>
                    {T.start}（約 NT${priceOf(sel.formats).usual}{priceOf(sel.formats).max > priceOf(sel.formats).usual ? `，最多 NT$${priceOf(sel.formats).max}` : ""}）
                  </button>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>價格：{costBasisNote(priceOf(sel.formats).basis, priceOf(sel.formats).n)}。{subNote(sel.formats) && `${subNote(sel.formats)}。`}{T.startHint(sel.formats, autoPublishes(site?.contentDefaults), dailyCap)}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(ACTION_FOR[sel.status] ?? []).filter(([a]) => a !== "approve" || NEXT[sel.status].includes("approved")).map(([a, label]) => (
                  <button key={a} type="button" className="btn btn-secondary" disabled={busy} onClick={() => void one(a)}>{label}</button>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
