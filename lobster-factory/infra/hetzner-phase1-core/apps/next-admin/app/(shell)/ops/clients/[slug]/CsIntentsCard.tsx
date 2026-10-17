"use client";

// 客服 tab → 意圖與自動化: per intent, how the AI answers (關閉 / 草稿 / 自動), the auto share, the
// golden set and its exam. 自動 opens only after the intent passed its exam (plan §5.2): the API
// refuses L2 otherwise (cs-intents route) and the engine drafts anyway (decideAnswerAction). The
// sentence under each intent is lib/cs/intent-config.ts intentBehavior — the engine's own rules.
// APIs: /api/ops/clients/[slug]/cs-intents, /cs-eval-cases, /api/ops/cs/eval.
//
// Layout: a filter row (by answer level / 敏感 / exam state), then one collapsed row per intent
// whose header carries its tags; the controls open on click. The add form opens from the toolbar.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { roleHeader } from "@/lib/ops-role";
import { examInFlight, intentBehavior } from "@/lib/cs/intent-config";
import type { IntentGraduation } from "@/lib/cs/types";
import { Card, ChipBtn, Tag, type TagTone } from "./hub-ui";

export type CsIntentRow = {
  key: string; label: string; answer_level: string; action_level: string;
  is_sensitive: boolean; confidence_threshold: number; canary_pct: number;
  graduation: (IntentGraduation & { current?: boolean }) | null; evalCaseCount: number;
  handoffReply: string | null;
};

type EvalCaseView = { id: string; intentKey: string; question: string; expectedPoints: string[]; expectHandoff: boolean };
type CaseResult = NonNullable<IntentGraduation["results"]>[number];

const ANSWER_CHOICES: Array<[string, string]> = [["L0", "關閉"], ["L1", "草稿"], ["L2", "自動"]];
const ACTION_CHOICES: Array<[string, string]> = [["A0", "無"], ["A1", "唯讀"], ["A2", "受閘寫"]];

const muted = { fontSize: 11, color: "var(--text-muted)" } as const;
const btn: CSSProperties = {
  fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
  background: "var(--accent)", color: "var(--btn-primary-text)", border: "none",
};
const btnGhost: CSSProperties = { ...btn, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--card-border)" };
const input = {
  fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--card-border)",
  background: "var(--bg-canvas)", color: "var(--text-primary)",
} as const;

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; error?: string; message?: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json", ...roleHeader("admin") }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
  return { ok: res.ok && data.ok === true, error: data.error ?? `http_${res.status}`, message: data.message };
}

const pct = (v: number | undefined) => `${((v ?? 0) * 100).toFixed(1)}%`;
const taipei = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) : "");

function examLine(g: (IntentGraduation & { current?: boolean }) | null, count: number): { text: string; color: string } {
  if (count === 0) return { text: "還沒有考題", color: "var(--text-muted)" };
  if (!g) return { text: `考題 ${count} 題，還沒考`, color: "var(--text-muted)" };
  if (g.status === "running") {
    return examInFlight(g)
      ? { text: `考試中…（${taipei(g.startedAt)} 開始，每 30 題約 2–3 分鐘）`, color: "var(--text-secondary)" }
      : { text: `考試中斷（${taipei(g.heartbeatAt ?? g.startedAt)} 之後沒有回應），可以重新考試`, color: "var(--red)" };
  }
  if (g.status === "passed" && !g.current) {
    return { text: "考題或這個意圖的設定在考過之後改過，要重新考試", color: "var(--red)" };
  }
  if (g.status === "passed") {
    return { text: `✓ 通過：${g.n} 題，正確率 ${pct(g.passRate)}，危險誤答 0，該轉真人的都轉了（${taipei(g.finishedAt)}）`, color: "var(--green)" };
  }
  return { text: `✗ 沒通過：${(g.reasons ?? []).join("；") || "未知原因"}（${taipei(g.finishedAt)}）`, color: "var(--red)" };
}

// ── Classification ────────────────────────────────────────────────────────────

type ExamState = "none" | "untested" | "running" | "stalled" | "passed" | "stale" | "failed";

function examState(it: CsIntentRow): ExamState {
  const g = it.graduation;
  if (it.evalCaseCount === 0) return "none";
  if (!g) return "untested";
  if (g.status === "running") return examInFlight(g) ? "running" : "stalled";
  if (g.status === "passed") return g.current ? "passed" : "stale";
  return "failed";
}

const EXAM_TAG: Record<ExamState, { tone: TagTone; text: string }> = {
  none:     { tone: "gray",   text: "無考題" },
  untested: { tone: "gray",   text: "還沒考" },
  running:  { tone: "yellow", text: "考試中" },
  stalled:  { tone: "red",    text: "考試中斷" },
  passed:   { tone: "green",  text: "考試通過" },
  stale:    { tone: "red",    text: "需重考" },
  failed:   { tone: "red",    text: "沒通過" },
};

/** Needs the operator's attention before 自動 can be trusted. */
const needsExam = (s: ExamState) => s === "none" || s === "untested" || s === "stalled" || s === "stale" || s === "failed";

export type IntentMode = "auto" | "paused" | "draft" | "off" | "sensitive";

/** What the engine will actually do with this intent now — the one classification behind the row tag,
 *  the status strip and the filters (lib/cs/orchestrator decideAnswerAction: L2 drafts unless graduated and > 0 %). */
export function intentMode(it: CsIntentRow): IntentMode {
  const graduated = it.graduation?.status === "passed" && it.graduation.current === true;
  if (it.is_sensitive) return "sensitive";
  if (it.answer_level === "L0") return "off";
  if (it.answer_level === "L1") return "draft";
  return graduated && it.canary_pct > 0 ? "auto" : "paused";
}

function answerTag(it: CsIntentRow) {
  switch (intentMode(it)) {
    case "sensitive": return <Tag tone="red">永遠轉真人</Tag>;
    case "off": return <Tag tone="gray">關閉・轉真人</Tag>;
    case "draft": return <Tag tone="yellow">草稿</Tag>;
    case "auto": return <Tag tone="green">自動 {it.canary_pct}%</Tag>;
    case "paused": return <Tag tone="yellow" title="設為自動，但現在只會出草稿">自動（暫停）</Tag>;
  }
}

function actionTag(level: string) {
  if (level === "A1") return <Tag tone="ai">唯讀</Tag>;
  if (level === "A2") return <Tag tone="accent">受閘寫</Tag>;
  return null;
}

type Filter = "all" | "L2" | "L1" | "L0" | "sensitive" | "needsExam";

const FILTERS: Array<[Filter, string]> = [
  ["all", "全部"], ["L2", "自動"], ["L1", "草稿"], ["L0", "關閉"], ["sensitive", "敏感"], ["needsExam", "待考試"],
];

function matches(it: CsIntentRow, f: Filter): boolean {
  switch (f) {
    case "all": return true;
    case "sensitive": return it.is_sensitive;
    case "needsExam": return needsExam(examState(it));
    default: return it.answer_level === f;
  }
}

// ── One intent ────────────────────────────────────────────────────────────────

function IntentItem({ slug, it, reload }: { slug: string; it: CsIntentRow; reload: () => Promise<void> }) {
  const graduated = it.graduation?.status === "passed" && it.graduation.current === true;
  const running = examInFlight(it.graduation);
  const [expanded, setExpanded] = useState(false);
  const [share, setShare] = useState(String(it.canary_pct));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<EvalCaseView[] | null>(null);
  const [results, setResults] = useState<CaseResult[]>([]);
  const [importText, setImportText] = useState("");
  const [reply, setReply] = useState(it.handoffReply ?? "");
  useEffect(() => { setReply(it.handoffReply ?? ""); }, [it.handoffReply]);

  useEffect(() => { setShare(String(it.canary_pct)); }, [it.canary_pct]);

  async function act(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, done: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await fn();
      setMsg(r.ok ? `✓ ${done}` : `⚠ ${r.message ?? r.error}`);
      await reload();
    } catch (e) { setMsg(`⚠ ${String(e)}`); } finally { setBusy(false); }
  }

  const setLevel = (level: string) => act(
    // Choosing 自動 sends the share with it: L2 at 0% would still only draft.
    () => send(`/api/ops/clients/${slug}/cs-intents`, "PATCH", level === "L2"
      ? { key: it.key, answerLevel: "L2", canaryPct: it.canary_pct > 0 ? it.canary_pct : 100 }
      : { key: it.key, answerLevel: level }),
    "回覆方式已改",
  );
  const setAction = (level: string) => act(() => send(`/api/ops/clients/${slug}/cs-intents`, "PATCH", { key: it.key, actionLevel: level }), "行動已改");
  const saveReply = () => act(() => send(`/api/ops/clients/${slug}/cs-intents`, "PATCH", { key: it.key, handoffReply: reply.trim() || null }), reply.trim() ? "轉真人時的回覆已存" : "改回一般確認句");
  const saveShare = () => {
    // Number("") is 0 and a full-width digit is NaN: both would quietly pause the intent or fail with no_fields.
    const v = Number(share.normalize("NFKC").trim());
    if (share.trim() === "" || !Number.isInteger(v) || v < 0 || v > 100) { setMsg("⚠ 自動比例要填 0–100 的整數"); return; }
    void act(() => send(`/api/ops/clients/${slug}/cs-intents`, "PATCH", { key: it.key, canaryPct: v }), "自動比例已存");
  };
  const startExam = () => act(() => send("/api/ops/cs/eval", "POST", { slug, intentKey: it.key }), "考試開始，結果會自動出現");
  const remove = () => {
    if (!window.confirm(`刪除意圖「${it.label}」？考題會一起刪掉。`)) return;
    void act(() => send(`/api/ops/clients/${slug}/cs-intents`, "DELETE", { key: it.key }), "已刪除");
  };

  async function loadCases() {
    const res = await fetch(`/api/ops/clients/${slug}/cs-eval-cases`, { headers: { ...roleHeader("admin") } });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; cases?: EvalCaseView[]; results?: Record<string, CaseResult[]> };
    setCases((data.cases ?? []).filter((c) => c.intentKey === it.key));
    setResults(data.results?.[it.key] ?? []);
  }
  // A verdict that lands while the list is open replaces the shown results.
  const finishedAt = it.graduation?.finishedAt;
  useEffect(() => {
    if (open && finishedAt) void loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on a new verdict only
  }, [finishedAt]);
  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) await loadCases();
  }
  const importCases = () => act(async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(importText); } catch { return { ok: false, message: "不是有效的 JSON" }; }
    const r = await send(`/api/ops/clients/${slug}/cs-eval-cases`, "PUT", { intentKey: it.key, cases: parsed });
    if (r.ok) { setImportText(""); await loadCases(); }
    return r;
  }, "考題已取代，需要重新考試");

  const exam = examLine(it.graduation, it.evalCaseCount);
  const state = examState(it);
  const resultOf = (q: string) => results.find((r) => r.question === q);
  const autoOn = it.answer_level === "L2" && graduated && !it.is_sensitive && it.canary_pct > 0;

  const label = (text: string) => <span style={{ ...muted, width: 72, flexShrink: 0 }}>{text}</span>;

  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, marginTop: 8, background: expanded ? "var(--bg-canvas)" : "transparent" }}>
      {/* Header: name, key, tags. Click to open the controls. */}
      <button onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", flexWrap: "wrap",
        background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: "var(--text-primary)",
      }}>
        <span aria-hidden style={{ ...muted, width: 10, display: "inline-block", transform: expanded ? "rotate(90deg)" : "none", transition: "transform .12s" }}>▸</span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{it.label}</span>
        <span style={{ ...muted, fontFamily: "monospace", fontSize: 10 }}>{it.key}</span>
        <span style={{ flex: 1 }} />
        {answerTag(it)}
        {actionTag(it.action_level)}
        {it.is_sensitive && <Tag tone="red">敏感</Tag>}
        <Tag tone={EXAM_TAG[state].tone} title={exam.text}>{EXAM_TAG[state].text}{it.evalCaseCount > 0 ? ` · ${it.evalCaseCount} 題` : ""}</Tag>
      </button>

      {expanded && (
        <div style={{ padding: "4px 12px 12px 30px", fontSize: 12, borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ marginTop: 8, fontSize: 12, color: autoOn ? "var(--green)" : "var(--text-secondary)" }}>
            現在：{intentBehavior({ answerLevel: it.answer_level, canaryPct: it.canary_pct, isSensitive: it.is_sensitive, graduated })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {label("回覆方式")}
            {ANSWER_CHOICES.map(([v, l]) => (
              <ChipBtn key={v} label={l} active={it.answer_level === v} disabled={busy || (v === "L2" && !graduated)}
                title={v === "L2" && !graduated ? "先通過下面的考試，才能改成自動" : undefined}
                onClick={() => { if (it.answer_level !== v) void setLevel(v); }} />
            ))}
            {!graduated && <span style={muted}>（通過考試後才能改自動）</span>}
          </div>
          {it.answer_level === "L2" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              {label("自動比例")}
              <input value={share} onChange={(e) => setShare(e.target.value)} inputMode="numeric" style={{ ...input, width: 56 }} />
              <span style={muted}>% 的客人由 AI 直接回，其餘出草稿</span>
              <button onClick={saveShare} disabled={busy} style={btn}>存</button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {label("行動")}
            {ACTION_CHOICES.map(([v, l]) => (
              <ChipBtn key={v} label={l} active={it.action_level === v} disabled={busy} onClick={() => { if (it.action_level !== v) void setAction(v); }} />
            ))}
            <span style={muted}>AI 能不能查、能不能改資料</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 6 }}>
            <span style={{ ...muted, width: 72, flexShrink: 0, paddingTop: 5 }}>轉真人時</span>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={300}
              placeholder="留空＝一般確認句「已收到您的訊息，我們會盡快回覆您」。例如退款：請先留下想退款的原因"
              style={{ ...input, flex: 1, minWidth: 0 }} />
            <button onClick={saveReply} disabled={busy || reply.trim() === (it.handoffReply ?? "")} style={{ ...btn, opacity: busy || reply.trim() === (it.handoffReply ?? "") ? 0.5 : 1 }}>存</button>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--border-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Tag tone={EXAM_TAG[state].tone}>{EXAM_TAG[state].text}</Tag>
              <span style={{ fontSize: 11, color: exam.color, flex: 1, minWidth: 200 }}>{exam.text}</span>
              <button onClick={startExam} disabled={busy || running || it.evalCaseCount === 0}
                title="每題約 0.02 美元（AI 實際寫一次答案並評分）"
                style={{ ...btn, opacity: busy || running || it.evalCaseCount === 0 ? 0.5 : 1 }}>開始考試</button>
              <button onClick={toggleOpen} style={btnGhost}>
                {open ? "收起考題" : `考題與結果（${it.evalCaseCount}）`}
              </button>
            </div>
            <p style={{ ...muted, margin: "6px 0 0", lineHeight: 1.6 }}>
              自動要先通過考試：至少 30 題、正確率 95%、沒有危險誤答、該轉真人的都轉。
            </p>
          </div>

          {open && (
            <div style={{ marginTop: 8, paddingLeft: 8, borderLeft: "2px solid var(--border-subtle)" }}>
              {cases === null && <div style={muted}>讀取中…</div>}
              {cases?.map((c, i) => {
                const r = resultOf(c.question);
                return (
                  <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px dashed var(--border-subtle)" }}>
                    <div>
                      {r ? (r.pass ? <span style={{ color: "var(--green)" }}>✓ </span> : <span style={{ color: "var(--red)" }}>✗ </span>) : null}
                      {i + 1}. {c.question}
                    </div>
                    <div style={muted}>{c.expectHandoff ? "應該：轉真人" : `應該回答到：${c.expectedPoints.join("／")}`}</div>
                    {r && (
                      <div style={{ ...muted, marginTop: 2 }}>
                        實際：{r.didHandoff ? "轉真人" : `回答「${r.answer.slice(0, 120)}${r.answer.length > 120 ? "…" : ""}」`}
                        {r.dangerous ? "（危險：該轉真人卻回答了）" : ""}
                        {r.resolvedIntentKey && r.resolvedIntentKey !== it.key ? `（被分到「${r.resolvedIntentKey}」）` : ""}
                        {r.judgeReason ? `　評分：${r.judgeReason}` : ""}
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ marginTop: 8 }}>
                <div style={muted}>貼上考題 JSON 取代這個意圖的全部考題（取代後要重新考試）：</div>
                <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={4}
                  placeholder='[{"question":"…","expectedPoints":["…"],"expectHandoff":false}]'
                  style={{ ...input, width: "100%", fontFamily: "monospace", marginTop: 4 }} />
                <button onClick={importCases} disabled={busy || !importText.trim()} style={{ ...btn, marginTop: 4, opacity: busy || !importText.trim() ? 0.5 : 1 }}>取代考題</button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            {msg && <span style={{ fontSize: 11, color: msg.startsWith("✓") ? "var(--green)" : "var(--red)", flex: 1 }}>{msg}</span>}
            <span style={{ flex: 1 }} />
            <button onClick={remove} disabled={busy} style={{ ...btnGhost, color: "var(--red)", borderColor: "var(--red)" }}>刪除意圖</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────────

function AddIntentForm({ slug, existingKeys, reload, onClose, onAdded }: {
  slug: string; existingKeys: string[]; reload: () => Promise<void>; onClose: () => void; onAdded: (label: string) => void;
}) {
  const [key, setKey] = useState(""); const [label, setLabel] = useState("");
  const [ans, setAns] = useState("L1"); const [act, setAct] = useState("A0"); const [sensitive, setSensitive] = useState(false);
  const [saving, setSaving] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const duplicate = existingKeys.includes(key.trim());

  async function add() {
    setSaving(true); setMsg(null);
    try {
      // The API upserts by key: re-posting an existing key would silently overwrite its label, action and sensitivity.
      if (duplicate) throw new Error(`「${key.trim()}」已經有了，展開那一列改就好`);
      const r = await send(`/api/ops/clients/${slug}/cs-intents`, "POST", { key: key.trim(), label: label.trim(), answerLevel: ans, actionLevel: act, isSensitive: sensitive });
      if (!r.ok) throw new Error(r.message ?? r.error);
      const added = label.trim();
      setKey(""); setLabel(""); setSensitive(false);
      await reload();
      onAdded(added);
      onClose();
    } catch (e) { setMsg(`⚠ ${e instanceof Error ? e.message : String(e)}`); } finally { setSaving(false); }
  }

  const lbl = (text: string) => <span style={{ ...muted, width: 72, flexShrink: 0 }}>{text}</span>;
  return (
    <div style={{ border: "1px solid var(--accent)", borderRadius: 8, padding: "10px 12px", marginTop: 8, background: "var(--accent-light)", fontSize: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text-primary)" }}>新增意圖</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
        {lbl("代碼 key")}
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="order_status" style={{ ...input, flex: 1, fontFamily: "monospace" }} />
        {duplicate && <Tag tone="red">已存在</Tag>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
        {lbl("名稱")}
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="訂單狀態查詢" style={{ ...input, flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0", flexWrap: "wrap" }}>
        {lbl("回覆方式")}
        {ANSWER_CHOICES.filter(([v]) => v !== "L2").map(([v, l]) => <ChipBtn key={v} label={l} active={ans === v} onClick={() => setAns(v)} />)}
        <span style={muted}>（通過考試後才能改自動）</span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0", flexWrap: "wrap" }}>
        {lbl("行動")}
        {ACTION_CHOICES.map(([v, l]) => <ChipBtn key={v} label={l} active={act === v} onClick={() => setAct(v)} />)}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", padding: "4px 0 0 80px" }}>
        <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} /> 敏感（金錢／身分／法律，永遠轉真人）
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button onClick={add} disabled={saving || !key.trim() || !label.trim() || duplicate} style={{ ...btn, opacity: saving || !key.trim() || !label.trim() || duplicate ? 0.5 : 1 }}>
          {saving ? "新增中…" : "新增意圖"}
        </button>
        <button onClick={onClose} disabled={saving} style={btnGhost}>取消</button>
        {msg && <span style={{ fontSize: 11, color: "var(--red)" }}>{msg}</span>}
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function CsIntentsCard({ slug, intents, loading, loadError = null, reload, csEnabled = true }: {
  slug: string; intents: CsIntentRow[]; loading: boolean; reload: () => Promise<void>;
  /** cs-config could not be read: show that instead of an empty list that invites re-adding every intent. */
  loadError?: string | null;
  /** The tenant kill-switch; off means these settings are parked until it is on again. */
  csEnabled?: boolean;
}) {
  // The filter is a snapshot of the keys that matched when it was chosen. Re-filtering on every reload
  // would drop a row the moment its state changes (草稿 → click 關閉 → row gone with its ✓ and drafts).
  const [view, setView] = useState<{ filter: Filter; keys: Set<string> | null }>({ filter: "all", keys: null });
  const [adding, setAdding] = useState(false);
  const [addedMsg, setAddedMsg] = useState<string | null>(null);
  const filter = view.filter;
  const applyFilter = (f: Filter) => setView({ filter: f, keys: f === "all" ? null : new Set(intents.filter((i) => matches(i, f)).map((i) => i.key)) });

  // While an exam runs, refresh until its verdict lands.
  const anyRunning = intents.some((i) => examInFlight(i.graduation));
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => { void reload(); }, 10_000);
    return () => clearInterval(t);
  }, [anyRunning, reload]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([f]) => [f, intents.filter((i) => matches(i, f)).length])) as Record<Filter, number>, [intents]);
  const visible = view.keys === null ? intents : intents.filter((i) => view.keys!.has(i.key));

  return (
    <>
      {!csEnabled && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, marginBottom: 12,
          background: "var(--badge-red-bg)", color: "var(--badge-red-text)", fontSize: 12 }}>
          <Tag tone="red" dot>AI 已停用</Tag>
          這裡的設定先不生效：沒命中常見問答的訊息一律轉真人。到「AI 開關」分頁啟用。
        </div>
      )}

      <Card title="意圖與自動化分級" badge={loading ? "…" : `${intents.length} 個`} action={<Tag tone="ai">AI</Tag>}>
        <p style={{ ...muted, margin: "0 0 10px", lineHeight: 1.6 }}>
          每個意圖選 AI 怎麼回：<strong>關閉</strong>＝直接轉真人；<strong>草稿</strong>＝AI 寫給專員看；<strong>自動</strong>＝AI 直接回客人（要先通過考試）。
          點一列展開設定。
        </p>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {FILTERS.map(([f, l]) => (
            <ChipBtn key={f} label={`${l} ${loading ? "" : counts[f]}`.trim()} active={filter === f} onClick={() => applyFilter(f)} />
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={() => { setAdding((v) => !v); setAddedMsg(null); }} style={{ ...btn, background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" }}>
            {adding ? "收起新增" : "＋ 新增意圖"}
          </button>
        </div>
        {filter !== "all" && <p style={{ ...muted, margin: "6px 0 0" }}>篩選結果固定在你按下時的狀態；改了設定的列會留在原位，按一次篩選鈕才重算。</p>}
        {addedMsg && <div style={{ marginTop: 6, fontSize: 11, color: "var(--green)" }}>{addedMsg}</div>}

        {adding && (
          <AddIntentForm slug={slug} existingKeys={intents.map((i) => i.key)} reload={reload} onClose={() => setAdding(false)}
            onAdded={(label) => { setView({ filter: "all", keys: null }); setAddedMsg(`✓ 已新增意圖「${label}」，在列表最後`); }} />
        )}

        {loading && <p style={{ ...muted, padding: "14px 0", margin: 0 }}>讀取中…</p>}
        {!loading && loadError && <p style={{ padding: "14px 0", margin: 0, fontSize: 12, color: "var(--red)" }}>意圖讀不到（{loadError}）。重新整理再試；不要在這裡重新新增。</p>}
        {!loading && !loadError && intents.length === 0 && <p style={{ ...muted, padding: "14px 0", margin: 0 }}>還沒有意圖。按「＋ 新增意圖」開始。</p>}
        {!loading && !loadError && intents.length > 0 && visible.length === 0 && <p style={{ ...muted, padding: "14px 0", margin: 0 }}>這個篩選沒有意圖。</p>}
        {!loading && !loadError && visible.map((it) => <IntentItem key={it.key} slug={slug} it={it} reload={reload} />)}
      </Card>
    </>
  );
}
