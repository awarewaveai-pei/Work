"use client";

// 客服 tab → 意圖與自動化: per intent, how the AI answers (關閉 / 草稿 / 自動), the auto share, the
// golden set and its exam. 自動 opens only after the intent passed its exam (plan §5.2): the API
// refuses L2 otherwise (cs-intents route) and the engine drafts anyway (decideAnswerAction). The
// sentence under each intent is lib/cs/intent-config.ts intentBehavior — the engine's own rules.
// APIs: /api/ops/clients/[slug]/cs-intents, /cs-eval-cases, /api/ops/cs/eval.
import { useEffect, useState } from "react";
import { roleHeader } from "@/lib/ops-role";
import { examInFlight, intentBehavior } from "@/lib/cs/intent-config";
import type { IntentGraduation } from "@/lib/cs/types";
import { Card, ChipBtn } from "./hub-ui";

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
const btn = {
  fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
  background: "var(--accent)", color: "var(--btn-primary-text)", border: "none",
} as const;
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

function IntentItem({ slug, it, reload }: { slug: string; it: CsIntentRow; reload: () => Promise<void> }) {
  const graduated = it.graduation?.status === "passed" && it.graduation.current === true;
  const running = examInFlight(it.graduation);
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
  const saveShare = () => act(() => send(`/api/ops/clients/${slug}/cs-intents`, "PATCH", { key: it.key, canaryPct: Number(share) }), "自動比例已存");
  const startExam = () => act(() => send("/api/ops/cs/eval", "POST", { slug, intentKey: it.key }), "考試開始，結果會自動出現");
  const remove = () => act(() => send(`/api/ops/clients/${slug}/cs-intents`, "DELETE", { key: it.key }), "已刪除");

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
  const resultOf = (q: string) => results.find((r) => r.question === q);
  const autoOn = it.answer_level === "L2" && graduated && !it.is_sensitive && it.canary_pct > 0;

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontWeight: 500 }}>
          {it.label}<span style={{ ...muted, fontWeight: 400, marginLeft: 6, fontFamily: "monospace", fontSize: 10 }}>{it.key}</span>
        </span>
        <button onClick={remove} disabled={busy} aria-label="刪除" style={{ border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14 }}>×</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <span style={{ ...muted, width: 64 }}>回覆方式</span>
        {ANSWER_CHOICES.map(([v, l]) => (
          <ChipBtn key={v} label={l} active={it.answer_level === v} disabled={busy || (v === "L2" && !graduated)}
            title={v === "L2" && !graduated ? "先通過下面的考試，才能改成自動" : undefined}
            onClick={() => { if (it.answer_level !== v) void setLevel(v); }} />
        ))}
      </div>
      {it.answer_level === "L2" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
          <span style={{ ...muted, width: 64 }}>自動比例</span>
          <input value={share} onChange={(e) => setShare(e.target.value)} inputMode="numeric" style={{ ...input, width: 56 }} />
          <span style={muted}>%</span>
          <button onClick={saveShare} disabled={busy} style={btn}>存</button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <span style={{ ...muted, width: 64 }}>行動</span>
        {ACTION_CHOICES.map(([v, l]) => (
          <ChipBtn key={v} label={l} active={it.action_level === v} disabled={busy} onClick={() => { if (it.action_level !== v) void setAction(v); }} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 6 }}>
        <span style={{ ...muted, width: 64, paddingTop: 5 }}>轉真人時</span>
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={300}
          placeholder="留空＝一般確認句「已收到您的訊息，我們會盡快回覆您」。例如退款：請先留下想退款的原因"
          style={{ ...input, flex: 1, minWidth: 0 }} />
        <button onClick={saveReply} disabled={busy || reply.trim() === (it.handoffReply ?? "")} style={{ ...btn, opacity: busy || reply.trim() === (it.handoffReply ?? "") ? 0.5 : 1 }}>存</button>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: autoOn ? "var(--green)" : "var(--text-secondary)" }}>
        → {intentBehavior({ answerLevel: it.answer_level, canaryPct: it.canary_pct, isSensitive: it.is_sensitive, graduated })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: exam.color, flex: 1, minWidth: 200 }}>考試：{exam.text}</span>
        <button onClick={startExam} disabled={busy || running || it.evalCaseCount === 0}
          title="每題約 0.02 美元（AI 實際寫一次答案並評分）"
          style={{ ...btn, opacity: busy || running || it.evalCaseCount === 0 ? 0.5 : 1 }}>開始考試</button>
        <button onClick={toggleOpen} style={{ ...btn, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--card-border)" }}>
          {open ? "收起考題" : `考題與結果（${it.evalCaseCount}）`}
        </button>
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
      {msg && <div style={{ marginTop: 6, fontSize: 11, color: msg.startsWith("✓") ? "var(--green)" : "var(--red)" }}>{msg}</div>}
    </div>
  );
}

export function CsIntentsCard({ slug, intents, loading, reload }: {
  slug: string; intents: CsIntentRow[]; loading: boolean; reload: () => Promise<void>;
}) {
  const [key, setKey] = useState(""); const [label, setLabel] = useState("");
  const [ans, setAns] = useState("L1"); const [act, setAct] = useState("A0"); const [sensitive, setSensitive] = useState(false);
  const [saving, setSaving] = useState(false); const [msg, setMsg] = useState<string | null>(null);

  // While an exam runs, refresh until its verdict lands.
  const anyRunning = intents.some((i) => examInFlight(i.graduation));
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => { void reload(); }, 10_000);
    return () => clearInterval(t);
  }, [anyRunning, reload]);

  async function add() {
    setSaving(true); setMsg(null);
    try {
      const r = await send(`/api/ops/clients/${slug}/cs-intents`, "POST", { key, label, answerLevel: ans, actionLevel: act, isSensitive: sensitive });
      if (!r.ok) throw new Error(r.message ?? r.error);
      setMsg("✓ 已新增意圖"); setKey(""); setLabel(""); setSensitive(false);
      await reload();
    } catch (e) { setMsg(`⚠ ${e instanceof Error ? e.message : String(e)}`); } finally { setSaving(false); }
  }

  return (
    <Card title={`意圖與自動化分級（${loading ? "…" : intents.length}）`}>
      <p style={{ ...muted, margin: "0 0 4px", lineHeight: 1.6 }}>
        每個意圖選 AI 怎麼回：關閉＝直接轉真人；草稿＝AI 寫給專員看；自動＝AI 直接回客人。
        自動要先通過考試（至少 30 題、正確率 95%、沒有危險誤答、該轉真人的都轉）。敏感＝金錢／身分／法律，永遠轉真人。
      </p>
      {!loading && intents.map((it) => <IntentItem key={it.key} slug={slug} it={it} reload={reload} />)}

      <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10, marginTop: 4, fontSize: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
          <span style={{ ...muted, width: 64 }}>代碼 key</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="order_status" style={{ ...input, flex: 1, fontFamily: "monospace" }} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
          <span style={{ ...muted, width: 64 }}>名稱</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="訂單狀態查詢" style={{ ...input, flex: 1 }} />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0", flexWrap: "wrap" }}>
          <span style={{ ...muted, width: 64 }}>回覆方式</span>
          {ANSWER_CHOICES.filter(([v]) => v !== "L2").map(([v, l]) => <ChipBtn key={v} label={l} active={ans === v} onClick={() => setAns(v)} />)}
          <span style={muted}>（通過考試後才能改自動）</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0", flexWrap: "wrap" }}>
          <span style={{ ...muted, width: 64 }}>行動</span>
          {ACTION_CHOICES.map(([v, l]) => <ChipBtn key={v} label={l} active={act === v} onClick={() => setAct(v)} />)}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", padding: "4px 0 0 72px" }}>
          <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} /> 敏感（永遠轉真人）
        </label>
        <button onClick={add} disabled={saving || !key || !label} style={{ ...btn, marginTop: 8, opacity: saving || !key || !label ? 0.5 : 1 }}>
          {saving ? "新增中…" : "新增意圖"}
        </button>
        {msg && <div style={{ marginTop: 6, fontSize: 11, color: msg.startsWith("✓") ? "var(--green)" : "var(--red)" }}>{msg}</div>}
      </div>
    </Card>
  );
}
