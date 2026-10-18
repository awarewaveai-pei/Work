"use client";

// 客服 tab of the client hub (/ops/clients/[slug]).
//
// A customer message flows: 常見問答 (free keyword match) → AI by intent level (關閉 / 草稿 / 自動)
// → 轉真人. The tab follows that order: a status strip, then one sub-tab per area — AI 開關,
// 常見問答, 意圖與自動化, Chatwoot 連線 — each with its own explanation, instead of four cards
// stacked with the rules repeated inside every card (operator, 2026-10-17: 排版沒有邏輯、內容塞在
// 一起). The APIs are unchanged: /api/ops/clients/[slug]/cs-config (kill-switch, 門檻, intents),
// /cis (csFaq), /cs-config/chatwoot-token. Intents render in CsIntentsCard.tsx.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { roleHeader } from "@/lib/ops-role";
import type { ClientConfig } from "@/app/api/ops/clients/route";
import { CsIntentsCard, type CsIntentRow } from "./CsIntentsCard";
import { Card, SubTabs, Tag, type SubTab } from "./hub-ui";

type Area = "ai" | "faq" | "intents" | "chatwoot";

/** Full-width digits and a comma decimal (Chinese IME) → a plain number string; "" stays "". */
const normalizeNumber = (s: string) => s.normalize("NFKC").replace(",", ".").trim();

const btnPrimary: CSSProperties = {
  fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer",
  background: "var(--accent)", color: "var(--btn-primary-text)", border: "none",
};
const btnGhost: CSSProperties = { ...btnPrimary, background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" };
const btnDanger: CSSProperties = { ...btnPrimary, background: "transparent", color: "var(--red)", border: "1px solid var(--red)" };
const field: CSSProperties = {
  fontSize: 12, padding: "6px 9px", borderRadius: 6, border: "1px solid var(--card-border)",
  background: "var(--bg-canvas)", color: "var(--text-primary)", fontFamily: "inherit",
};
const help: CSSProperties = { fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.7 };

function Msg({ text }: { text: string | null }) {
  if (!text) return null;
  return <div style={{ marginTop: 8, fontSize: 11, color: text.startsWith("✓") ? "var(--green)" : "var(--red)" }}>{text}</div>;
}

/** Label on the left, control on the right — the one row layout every setting here uses. */
function Row({ label, children, top }: { label: string; children: ReactNode; top?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: top ? "flex-start" : "center", gap: 10, padding: "5px 0", fontSize: 12 }}>
      <span style={{ color: "var(--text-muted)", width: 88, flexShrink: 0, paddingTop: top ? 6 : 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: top ? "flex-start" : "center", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}


// ── Area 1: AI 開關 ───────────────────────────────────────────────────────────

function PipelineCard() {
  const steps: Array<{ n: string; title: string; text: string; tone: "green" | "ai" | "yellow" | "red" }> = [
    { n: "1", title: "常見問答", text: "訊息含有某題的關鍵字 → 直接送出那題的答案。不經 AI、不花錢。", tone: "green" },
    { n: "2", title: "意圖分級", text: "AI 判斷意圖，依該意圖的設定：關閉 → 轉真人；草稿 → 寫給專員看；自動 → 直接回客人。", tone: "ai" },
    { n: "3", title: "知識門檻", text: "知識庫最相近段落分數低於門檻 → AI 不寫答案，轉真人。", tone: "yellow" },
    { n: "4", title: "轉真人", text: "敏感意圖（金錢／身分／法律）、兩題問答命中一樣多的關鍵字、退款／投訴／法律 → 一律轉真人。", tone: "red" },
  ];
  return (
    <Card title="訊息怎麼走">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        {steps.map((s) => (
          <div key={s.n} style={{ background: "var(--bg-canvas)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)" }}>步驟 {s.n}</span>
              <Tag tone={s.tone}>{s.title}</Tag>
            </div>
            <p style={{ ...help, color: "var(--text-secondary)" }}>{s.text}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AiSwitchArea({ slug, csEnabled, setCsEnabled, savedMinScore, setSavedMinScore, minScoreDefault }: {
  slug: string; csEnabled: boolean; setCsEnabled: (v: boolean) => void;
  /** What the server holds ("" = default). The input below is a separate draft, so a background reload never overwrites typing. */
  savedMinScore: string; setSavedMinScore: (v: string) => void; minScoreDefault: number;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [scoreMsg, setScoreMsg] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(savedMinScore);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setMinScore(savedMinScore); }, [savedMinScore, dirty]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/ops/clients/${slug}/cs-config`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...roleHeader("admin") }, body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; csEnabled?: boolean; kbMinRetrievalScore?: number | null };
    if (!res.ok || !data.ok) throw new Error(data.error ?? `save_failed_${res.status}`);
    return data;
  }

  async function toggleKill() {
    setSaving(true); setMsg(null);
    const next = !csEnabled;
    try {
      const data = await patch({ csEnabled: next });
      setCsEnabled(data.csEnabled ?? next);
      setMsg(next ? "✓ 已啟用 AI 客服" : "✓ 已停用 AI（不花錢）。常見問答照常自動回覆，其他訊息轉真人。");
    } catch (e) { setMsg(`⚠ ${String(e)}`); } finally { setSaving(false); }
  }

  async function saveMinScore() {
    setScoreMsg(null);
    const raw = normalizeNumber(minScore);
    const value = raw === "" ? null : Number(raw);
    // NaN would serialise as null and silently reset the tenant's calibrated threshold to the default.
    if (value !== null && !Number.isFinite(value)) { setScoreMsg(`⚠ 「${minScore}」不是數字，沒有存。填 0.2–0.8 之間的數字，或留空用預設。`); return; }
    setSaving(true);
    try {
      const data = await patch({ kbMinRetrievalScore: value });
      const stored = typeof data.kbMinRetrievalScore === "number" ? String(data.kbMinRetrievalScore) : "";
      setSavedMinScore(stored); setMinScore(stored); setDirty(false);
      setScoreMsg(stored === "" ? `✓ 改回預設 ${minScoreDefault}` : `✓ 門檻已存：${stored}`);
    } catch (e) { setScoreMsg(`⚠ ${String(e)}`); } finally { setSaving(false); }
  }

  return (
    <>
      <Card title="AI 總開關" action={<Tag tone={csEnabled ? "green" : "red"} dot>{csEnabled ? "啟用中" : "已停用"}</Tag>}>
        <p style={{ ...help, marginBottom: 10 }}>
          這個客戶的 kill-switch。停用後不呼叫 AI（不花錢）：常見問答照常自動回覆，其他訊息一律轉真人。
          每個意圖怎麼回，在「意圖與自動化」分頁設定。
        </p>
        <button onClick={toggleKill} disabled={saving}
          style={{ ...btnPrimary, background: csEnabled ? "var(--red)" : "var(--accent)", opacity: saving ? 0.6 : 1 }}>
          {saving ? "處理中…" : csEnabled ? "停用 AI 客服" : "啟用 AI 客服"}
        </button>
        <Msg text={msg} />
      </Card>

      <Card title="知識門檻" action={<Tag tone="yellow">{savedMinScore === "" ? `預設 ${minScoreDefault}` : `自訂 ${savedMinScore}`}</Tag>}>
        <p style={{ ...help, marginBottom: 8 }}>
          知識庫最相近段落的分數低於這個值，AI 就不寫答案、直接轉真人（也不花錢）。範圍 0.2–0.8，留空＝預設。
          英文網站配中文客人，用真問題量過再填（Soulful 2026-10-15 量到 0.40）。
        </p>
        <Row label="門檻分數">
          <input value={minScore} onChange={(e) => { setMinScore(e.target.value); setDirty(true); }} placeholder={`預設 ${minScoreDefault}`} inputMode="decimal"
            style={{ ...field, width: 90 }} />
          <button onClick={saveMinScore} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? "存…" : "存"}</button>
          {dirty && <span style={help}>還沒存</span>}
        </Row>
        <Msg text={scoreMsg} />
      </Card>

      <PipelineCard />
    </>
  );
}

// ── Area 2: 常見問答 ──────────────────────────────────────────────────────────

type FaqEntry = NonNullable<ClientConfig["csFaq"]>[number];
/** uid is the editor's own row identity: stable across edits and deletes, unlike the index or the server id ("" until saved). */
type FaqDraft = { uid: number; id: string; keywords: string; answer: string; handoff: boolean };
type FaqFilter = "all" | "handoff" | "incomplete";

const splitKeywords = (s: string) => Array.from(new Set(s.split(/[,，、\n]/).map((k) => k.trim()).filter(Boolean)));
let faqUid = 0;
const toDrafts = (entries: FaqEntry[] | undefined): FaqDraft[] =>
  (entries ?? []).map((e) => ({ uid: ++faqUid, id: e.id, keywords: e.keywords.join("、"), answer: e.answer, handoff: e.handoff === true }));
const isIncomplete = (r: FaqDraft) => splitKeywords(r.keywords).length === 0 || r.answer.trim() === "";
const faqMatches = (r: FaqDraft, f: FaqFilter) => (f === "all" ? true : f === "handoff" ? r.handoff : isIncomplete(r));

/** Free automatic answers (lib/cs/faq.ts): keyword match, sent as written, no AI and no credit. */
function FaqArea({ slug, initial, onCountChange }: { slug: string; initial?: ClientConfig["csFaq"]; onCountChange: (n: number) => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<FaqDraft[]>(() => toDrafts(initial));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // The filter is a snapshot of which rows matched when it was chosen. Re-filtering on every keystroke
  // would hide a row the moment the operator starts fixing it (未完成 → type a keyword → gone).
  const [view, setView] = useState<{ filter: FaqFilter; uids: Set<number> | null }>({ filter: "all", uids: null });
  const update = (uid: number, patch: Partial<FaqDraft>) => setRows((r) => r.map((row) => (row.uid === uid ? { ...row, ...patch } : row)));
  const applyFilter = (f: FaqFilter) => setView({ filter: f, uids: f === "all" ? null : new Set(rows.filter((r) => faqMatches(r, f)).map((r) => r.uid)) });
  useEffect(() => { onCountChange(rows.length); }, [rows.length, onCountChange]);

  const counts = { handoff: rows.filter((r) => r.handoff).length, incomplete: rows.filter(isIncomplete).length };
  const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => view.uids === null || view.uids.has(r.uid));

  async function save() {
    setSaving(true); setMsg(null);
    const sent = rows.length;
    try {
      const res = await fetch(`/api/ops/clients/${slug}/cis`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({ csFaq: rows.map((r) => ({ id: r.id, keywords: splitKeywords(r.keywords), answer: r.answer, handoff: r.handoff })) }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; csFaq?: FaqEntry[] | null };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `save_failed_${res.status}`);
      // Show what the server kept (it drops incomplete rows, caps the list, trims and assigns ids), and
      // refresh the page props so a later remount of this tab starts from the saved list, not the page-load one.
      const stored = Array.isArray(data.csFaq) ? data.csFaq : [];
      setRows(toDrafts(stored));
      setView({ filter: "all", uids: null });
      router.refresh();
      const dropped = sent - stored.length;
      setMsg(dropped > 0 ? `✓ 已儲存 ${stored.length} 題。${dropped} 題少了關鍵字或答案，沒有存。` : `✓ 已儲存 ${stored.length} 題`);
    } catch (e) { setMsg(`⚠ ${String(e)}`); } finally { setSaving(false); }
  }

  const filter = view.filter;
  const filterChip = (key: FaqFilter, label: string, n?: number) => (
    <button key={key} onClick={() => applyFilter(key)} style={{
      fontSize: 11, padding: "3px 10px", borderRadius: 20, cursor: "pointer", border: "1px solid",
      background: filter === key ? "var(--accent)" : "transparent",
      color: filter === key ? "var(--btn-primary-text)" : "var(--text-secondary)",
      borderColor: filter === key ? "var(--accent)" : "var(--card-border)",
    }}>{label}{typeof n === "number" ? ` ${n}` : ""}</button>
  );

  return (
    <>
      <Card title="常見問答自動回覆" badge={`${rows.length} 題`} action={<Tag tone="green">免費・不經 AI</Tag>}>
        <p style={{ ...help, marginBottom: 10 }}>
          客人的訊息含有某一題的關鍵字，就直接送出那一題的答案。關鍵字用頓號或逗號分開；一題可以有很多關鍵字。
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
          {filterChip("all", "全部", rows.length)}
          {filterChip("handoff", "答完轉真人", counts.handoff)}
          {filterChip("incomplete", "未完成", counts.incomplete)}
          <span style={{ flex: 1 }} />
          <button onClick={() => { setView({ filter: "all", uids: null }); setRows((rs) => [...rs, { uid: ++faqUid, id: "", keywords: "", answer: "", handoff: false }]); }} style={btnGhost}>＋ 新增一題</button>
          <button onClick={save} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? "儲存中…" : "儲存問答"}</button>
        </div>
        <Msg text={msg} />

        {rows.length === 0 && <p style={{ ...help, padding: "14px 0" }}>還沒有題目。按「＋ 新增一題」，填關鍵字和答案，再儲存。</p>}
        {rows.length > 0 && visible.length === 0 && <p style={{ ...help, padding: "14px 0" }}>這個篩選沒有題目。</p>}

        {visible.map(({ r, i }) => {
          const kws = splitKeywords(r.keywords);
          return (
            <div key={r.uid} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px", marginTop: 10, background: "var(--bg-canvas)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", width: 28 }}>#{i + 1}</span>
                {kws.length === 0 ? <Tag tone="red">沒有關鍵字</Tag> : kws.slice(0, 6).map((k) => <Tag key={k} tone="accent">{k}</Tag>)}
                {kws.length > 6 && <Tag tone="gray">+{kws.length - 6}</Tag>}
                {r.answer.trim() === "" && <Tag tone="red">沒有答案</Tag>}
                {r.handoff && <Tag tone="yellow">答完轉真人</Tag>}
                {r.id === "" && <Tag tone="gray">還沒存</Tag>}
                <span style={{ flex: 1 }} />
                <button onClick={() => setRows((rs) => rs.filter((row) => row.uid !== r.uid))} aria-label={`刪除第 ${i + 1} 題`}
                  style={{ ...btnDanger, padding: "3px 9px", fontSize: 11 }}>刪除</button>
              </div>
              <Row label="關鍵字">
                <input value={r.keywords} onChange={(e) => update(r.uid, { keywords: e.target.value })}
                  placeholder="例如：課程、療癒模組、上課" style={{ ...field, flex: 1 }} />
              </Row>
              <Row label="答案" top>
                <textarea value={r.answer} onChange={(e) => update(r.uid, { answer: e.target.value })} rows={3}
                  placeholder="送給客人的答案，照打的送出" style={{ ...field, flex: 1, resize: "vertical" }} />
              </Row>
              <Row label="之後">
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
                  <input type="checkbox" checked={r.handoff} onChange={(e) => update(r.uid, { handoff: e.target.checked })} />
                  答完也轉真人（預約、費用這類要有人接手的問題）
                </label>
              </Row>
            </div>
          );
        })}
      </Card>

      <Card title="命中規則">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.9 }}>
          <li>只要一題命中，答案照打的送出，不經 AI、不花錢；AI 停用時這裡照常運作。</li>
          <li>命中最多關鍵字的那題贏；兩題命中一樣多 → 不猜，轉真人。</li>
          <li>訊息提到退款／投訴／法律 → 不自動回，轉真人。</li>
          <li>少了關鍵字或答案的題目不會存（上方「未完成」篩選可以找到；篩選結果在你編輯時不會變動，按一次篩選鈕才重算）。</li>
        </ul>
      </Card>
    </>
  );
}

// ── Area 4: Chatwoot 連線 ─────────────────────────────────────────────────────

const CHATWOOT_TOKEN_ERRORS: Record<string, string> = {
  token_rejected: "Chatwoot 不接受這組 token。要用你自己的，不能用機器人的。",
  token_not_in_account: "這組 token 讀不到這個客戶的 Chatwoot 聯絡人。",
  token_unreachable: "連不到 Chatwoot，沒有存。稍後再試。",
  chatwoot_not_configured: "這個客戶還沒接上 Chatwoot。",
  forbidden_role: "只有擁有者或管理員能改。",
};

/** The operator's own Chatwoot token (vault only, never shown again): lets the system write a customer's name into the contact. */
function ChatwootArea({ slug, configured, setConfigured }: { slug: string; configured: boolean | null; setConfigured: (v: boolean) => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const url = `/api/ops/clients/${slug}/cs-config/chatwoot-token`;

  async function send(method: "PUT" | "DELETE") {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: method === "PUT" ? JSON.stringify({ token }) : undefined,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; configured?: boolean; baseline?: { ok: boolean; changes?: unknown[]; error?: string } };
      if (!res.ok || !data.ok) throw new Error(CHATWOOT_TOKEN_ERRORS[data.error ?? ""] ?? data.error ?? `失敗（${res.status}）`);
      setConfigured(data.configured === true);
      setToken("");
      // The save also applies the Chatwoot baseline (auto-resolve + closing macro); say what it did.
      const b = data.baseline;
      const baselineNote = !b ? "" : b.ok
        ? (b.changes?.length ? "；Chatwoot 已設好自動結案和結案巨集" : "；Chatwoot 基本設定原本就是對的")
        : `；但 Chatwoot 基本設定沒套上（${b.error}），每天的檢查會再試`;
      setMsg(method === "PUT" ? `✓ 已設定${baselineNote}` : "✓ 已清除");
    } catch (e) { setMsg(`⚠ ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(false); }
  }

  const status = configured === null ? <Tag tone="gray">讀取中…</Tag> : configured ? <Tag tone="green" dot>已設定</Tag> : <Tag tone="red" dot>未設定</Tag>;

  return (
    <>
      <Card title="Chatwoot 個人 token" action={status}>
        <p style={{ ...help, marginBottom: 10 }}>
          設定後，客人回答名字時，系統會把名字寫進 Chatwoot 聯絡人。存之前會先向 Chatwoot 確認；只存在伺服器，之後不會再顯示。
        </p>
        <Row label="Token">
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password"
            placeholder={configured ? "貼上新的 token 會取代舊的" : "貼上 token"} style={{ ...field, flex: 1, minWidth: 160 }} />
          <button onClick={() => send("PUT")} disabled={busy || !token.trim()} style={{ ...btnPrimary, opacity: busy || !token.trim() ? 0.5 : 1 }}>
            {busy ? "確認中…" : "存"}
          </button>
          {configured && <button onClick={() => send("DELETE")} disabled={busy} style={btnDanger}>清除</button>}
        </Row>
        <Msg text={msg} />
      </Card>

      <Card title="怎麼拿 token">
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.9 }}>
          <li>登入 Chatwoot，點右上角頭像 → 個人資料設定。</li>
          <li>找到「存取權杖」，複製。</li>
          <li>貼到上面的欄位按「存」。要用你自己的 token，不能用機器人的。</li>
        </ol>
        <p style={{ ...help, marginTop: 8 }}>
          存檔時系統順便套 Chatwoot 基本設定（自動結案 + 結案巨集）；沒套上的話每天的檢查會再試。
        </p>
      </Card>
    </>
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export function CustomerServiceTab({ org, cfg }: { org: { slug: string }; cfg: ClientConfig }) {
  const [area, setArea] = useState<Area>("ai");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [csEnabled, setCsEnabled] = useState(true);
  const [savedMinScore, setSavedMinScore] = useState<string>("");
  const [minScoreDefault, setMinScoreDefault] = useState<number>(0.5);
  const [intents, setIntents] = useState<CsIntentRow[]>([]);
  const [faqCount, setFaqCount] = useState((cfg.csFaq ?? []).length);
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);
  // Reloads overlap (10 s exam poll + one after every intent action); a response older than the latest request is dropped.
  const reloadSeq = useRef(0);

  const reloadConfig = useCallback(async () => {
    const seq = ++reloadSeq.current;
    try {
      const res = await fetch(`/api/ops/clients/${org.slug}/cs-config`, { headers: { ...roleHeader("admin") } });
      const data = (await res.json()) as { ok?: boolean; error?: string; csEnabled?: boolean; intents?: CsIntentRow[]; kbMinRetrievalScore?: number | null; kbMinRetrievalScoreDefault?: number };
      if (seq !== reloadSeq.current) return;
      if (!res.ok || !data.ok) { setLoadError(data.error ?? `http_${res.status}`); return; }
      setLoadError(null);
      setCsEnabled(data.csEnabled ?? true); setIntents(data.intents ?? []);
      setSavedMinScore(typeof data.kbMinRetrievalScore === "number" ? String(data.kbMinRetrievalScore) : "");
      if (typeof data.kbMinRetrievalScoreDefault === "number") setMinScoreDefault(data.kbMinRetrievalScoreDefault);
    } catch (e) { if (seq === reloadSeq.current) setLoadError(e instanceof Error ? e.message : String(e)); }
  }, [org.slug]);

  useEffect(() => {
    let alive = true;
    (async () => { await reloadConfig(); if (alive) setLoading(false); })();
    fetch(`/api/ops/clients/${org.slug}/cs-config/chatwoot-token`, { headers: { ...roleHeader("admin") } })
      .then((r) => r.json() as Promise<{ ok?: boolean; configured?: boolean }>)
      .then((d) => { if (alive && d.ok) setTokenConfigured(d.configured === true); })
      .catch(() => { /* status stays unknown */ });
    return () => { alive = false; };
  }, [org.slug, reloadConfig]);

  const n = (v: number) => (loading ? "…" : String(v));
  const tabs: Array<SubTab<Area>> = [
    { key: "ai", label: "AI 開關" },
    { key: "faq", label: "常見問答", count: faqCount },
    { key: "intents", label: "意圖與自動化", count: n(intents.length) },
    { key: "chatwoot", label: "Chatwoot 連線" },
  ];
  const threshold = savedMinScore === "" ? `預設 ${minScoreDefault}` : savedMinScore;

  return (
    <>
      {/* Header: section title and one-line description on the left; the two live states that change
          how messages are handled on the right, as status tags (the same Tag the cards use). Nothing
          here is clickable — the tab bar below is the only navigation. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.01em" }}>客服</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            客人訊息的處理規則：先比對常見問答，沒命中的由 AI 依意圖分級回覆，拿不準的轉真人。
          </p>
        </div>
        <div role="status" aria-label="目前狀態" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: 3 }}>
          {loadError ? <Tag tone="red" dot>設定讀取失敗（{loadError}）</Tag>
            : loading ? <Tag tone="gray">讀取中…</Tag>
            : csEnabled ? <><Tag tone="green" dot>AI 啟用中</Tag><span style={{ fontSize: 12, color: "var(--text-muted)" }}>知識門檻 {threshold}</span></>
            : <Tag tone="red" dot>AI 已停用</Tag>}
          {/* The personal token is optional (the bot token carries the conversation): missing is gray, not red. */}
          {tokenConfigured !== null && (
            <Tag tone={tokenConfigured ? "green" : "gray"} dot>Chatwoot 個人 token {tokenConfigured ? "已設定" : "未設定"}</Tag>
          )}
        </div>
      </div>

      <SubTabs<Area> label="客服設定" idPrefix="cs" tabs={tabs} active={area} onChange={(k) => setArea(k)} />

      {/* Every area stays mounted: switching sub-tabs must not throw away an unsaved FAQ draft or a half-typed token. */}
      <div role="tabpanel" id="cs-panel-ai" aria-labelledby="cs-tab-ai" hidden={area !== "ai"}>
        <AiSwitchArea slug={org.slug} csEnabled={csEnabled} setCsEnabled={setCsEnabled}
          savedMinScore={savedMinScore} setSavedMinScore={setSavedMinScore} minScoreDefault={minScoreDefault} />
      </div>
      <div role="tabpanel" id="cs-panel-faq" aria-labelledby="cs-tab-faq" hidden={area !== "faq"}>
        <FaqArea slug={org.slug} initial={cfg.csFaq} onCountChange={setFaqCount} />
      </div>
      <div role="tabpanel" id="cs-panel-intents" aria-labelledby="cs-tab-intents" hidden={area !== "intents"}>
        <CsIntentsCard slug={org.slug} intents={intents} loading={loading} loadError={loadError} reload={reloadConfig} csEnabled={csEnabled} />
      </div>
      <div role="tabpanel" id="cs-panel-chatwoot" aria-labelledby="cs-tab-chatwoot" hidden={area !== "chatwoot"}>
        <ChatwootArea slug={org.slug} configured={tokenConfigured} setConfigured={setTokenConfigured} />
      </div>
    </>
  );
}
