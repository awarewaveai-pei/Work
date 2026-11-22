"use client";

// Which road a text AI job takes (plan K6): four visible buttons, each a chain that always ends on the API. A subscription
// segment that is offline or out of allowance is only reported, never greyed out: the chain skips it by itself.
// The subscriptions are the owner's alone (I1): anyone else gets 403 from the state route and sees one fixed "API only" button.
import { useEffect, useState } from "react";
import { CodexLaptopButton } from "@/app/CodexLaptopButton";
import { SUB_TEXT_COST_LABEL, SUB_TEXT_MODELS, isSubTextModel, type SubTextModel, type TextChain } from "@/lib/ai/text-model-options";

type Tool = "claude" | "codex";
type WorkerState = { tools: Tool[]; online: boolean; quotaBlockedUntil: Partial<Record<Tool, number>> };

const COPY = {
  label: "文字 AI 走法",
  levelLabel: "Claude 等級",
  chains: [
    { value: "claude+codex+api", label: "Claude 訂閱 → Codex 訂閱 → API" },
    { value: "claude+api", label: "Claude 訂閱 → API" },
    { value: "codex+api", label: "Codex 訂閱 → API" },
    { value: "api", label: "只用 API" },
  ] as Array<{ value: TextChain; label: string }>,
  levels: [
    { value: "sub-claude-haiku", label: "Haiku" },
    { value: "sub-claude-sonnet", label: "Sonnet" },
    { value: "sub-claude-opus", label: "Opus" },
  ] as Array<{ value: SubTextModel; label: string }>,
  codex: "Codex 訂閱",
  claude: "Claude 訂閱",
  ok: `可用 · ${SUB_TEXT_COST_LABEL}`,
  offline: { owner: "筆電離線，這一段會跳過", schedule: "主機沒有登入這一家，這一段會跳過" },
  quota: (when: string) => `額度用完，${when} 恢復，這一段會跳過`,
  unreadable: "讀不到訂閱狀態",
};

/** Epoch ms -> "M/D HH:mm" in Taipei time. */
function taipei(ms: number): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

const btn = (on: boolean): React.CSSProperties => ({
  padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: on ? "default" : "pointer",
  border: `1px solid ${on ? "var(--accent)" : "var(--card-border)"}`,
  background: on ? "var(--accent)" : "var(--bg-card)", color: on ? "var(--bg-card)" : "var(--text-primary)",
});
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" };
const note: React.CSSProperties = { color: "var(--text-muted)", fontSize: 12 };

export default function TextChainButtons({ chain, claudeModel, onChange, lane, disabled = false }: {
  chain: TextChain;
  claudeModel: string;
  onChange: (next: { chain: TextChain; claudeModel: string }) => void;
  lane: "owner" | "schedule";
  disabled?: boolean;
}) {
  // Safe default = the fixed 只用 API screen. Only a 200 with ok swaps in the full buttons; 403 = not the owner (no
  // subscription wording at all); any other failure (401, 5xx, network) keeps API only and says the state is unreadable.
  const [state, setState] = useState<WorkerState | "denied" | "error" | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const r = await fetch(`/api/tools/sub-worker?lane=${lane}`, { cache: "no-store" });
        const j = (await r.json().catch(() => null)) as ({ ok?: boolean } & Partial<WorkerState>) | null;
        if (!live) return;
        if (r.status === 403) setState("denied");
        else if (r.ok && j?.ok) setState({ tools: j.tools ?? [], online: !!j.online, quotaBlockedUntil: j.quotaBlockedUntil ?? {} });
        else setState("error");
      } catch { if (live) setState("error"); }
    })();
    return () => { live = false; };
  }, [lane]);

  if (state === null || state === "denied" || state === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={row}>
          <span style={note}>{COPY.label}</span>
          <button type="button" style={btn(true)} aria-pressed disabled>{COPY.chains[3].label}</button>
        </div>
        {state === "error" && <div style={note}>{COPY.unreadable}</div>}
      </div>
    );
  }

  const segments = chain.split("+").filter((s): s is Tool => s === "claude" || s === "codex");

  const worker = state;
  function status(tool: Tool): string {
    const until = worker.quotaBlockedUntil[tool];
    if (until !== undefined && until > Date.now()) return COPY.quota(taipei(until));
    if (!worker.online || !worker.tools.includes(tool)) return COPY.offline[lane];
    return COPY.ok;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={row}>
        <span style={note}>{COPY.label}</span>
        {COPY.chains.map((c) => (
          <button key={c.value} type="button" style={btn(chain === c.value)} disabled={disabled}
            aria-pressed={chain === c.value} onClick={() => { if (c.value !== chain) onChange({ chain: c.value, claudeModel }); }}>
            {c.label}
          </button>
        ))}
      </div>
      {segments.includes("claude") && (
        <div style={row}>
          <span style={note}>{COPY.levelLabel}</span>
          {COPY.levels.map((l) => (
            <button key={l.value} type="button" style={btn(claudeModel === l.value)} disabled={disabled}
              aria-pressed={claudeModel === l.value} onClick={() => onChange({ chain, claudeModel: l.value })}>
              {l.label}
            </button>
          ))}
        </div>
      )}
      {segments.map((tool) => {
        const text = status(tool);
        const name = tool === "claude" ? (isSubTextModel(claudeModel) ? SUB_TEXT_MODELS[claudeModel].label : COPY.claude) : COPY.codex;
        return (
          <div key={tool} style={note}>
            {name}：{text}
            {text === COPY.offline.owner && <CodexLaptopButton variant="page" />}
          </div>
        );
      })}
    </div>
  );
}
