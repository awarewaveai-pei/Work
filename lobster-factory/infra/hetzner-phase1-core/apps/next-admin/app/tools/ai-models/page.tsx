import {
  AI_MODEL_SOURCES,
  CODING_TOOL_COMPARISONS,
  TEXT_MODEL_COMPARISONS,
  type CodingToolComparison,
  type TextModelComparison,
} from "@/lib/ai/model-comparison";
import { TAROT_MODEL_COMPARISONS, TAROT_MODEL_SOURCES, type TarotModelComparison } from "@/lib/tarot/model-comparison";

export const metadata = { title: "AI Model Guide · Lobster Factory" };

const TWD_RATE = 32; // USD → NT$ reference rate (update periodically)
const ntd = (usd: number) => Math.round(usd * TWD_RATE * 10) / 10;

const sourceLabel: Record<string, string> = {
  openaiPricing: "OpenAI pricing",
  openaiGpt55: "GPT-5.5 docs",
  codexPricing: "Codex pricing",
  claudeModels: "Claude models",
  claudePricing: "Claude pricing",
  claudeCode: "Claude Code",
  geminiModels: "Gemini models",
  geminiPricing: "Gemini pricing",
  geminiCodeAssist: "Gemini Code Assist",
  perplexityPricing: "Perplexity pricing",
  perplexityModels: "Perplexity models",
  xaiModels: "xAI models",
  grokBuild: "Grok Build",
};

function SourceLinks({ keys }: { keys: readonly string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
      {keys.map((key) => {
        const url = AI_MODEL_SOURCES[key as keyof typeof AI_MODEL_SOURCES];
        if (!url) return null;
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--accent)",
              textDecoration: "none",
              border: "1px solid var(--card-border)",
              background: "#fff",
              borderRadius: 999,
              padding: "2px 7px",
              fontSize: 10.5,
              whiteSpace: "nowrap",
            }}
          >
            {sourceLabel[key] ?? key}
          </a>
        );
      })}
    </div>
  );
}

function ImageSourceLinks({ keys }: { keys: readonly string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
      {keys.map((key) => {
        const url = TAROT_MODEL_SOURCES[key as keyof typeof TAROT_MODEL_SOURCES];
        if (!url) return null;
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--accent)",
              textDecoration: "none",
              border: "1px solid var(--card-border)",
              background: "#fff",
              borderRadius: 999,
              padding: "2px 7px",
              fontSize: 10.5,
              whiteSpace: "nowrap",
            }}
          >
            {key}
          </a>
        );
      })}
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={{ border: "1px solid var(--card-border)", borderRadius: 8, background: "var(--bg-subtle)", padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", marginTop: 5 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.45, marginTop: 3 }}>{detail}</div>
    </div>
  );
}

function TextModelsTable({ rows }: { rows: readonly TextModelComparison[] }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--card-border)", borderRadius: 8 }}>
      <table style={{ width: "100%", minWidth: 1420, borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["供應商 / 模型", "適合任務", "風格", "字數成本", "速度 / Context", "優勢", "限制"].map((h) => (
              <th key={h} style={headCellStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={`${m.vendor}-${m.model}`}>
              <td style={{ ...bodyCellStyle, width: 190 }}>
                <div style={{ fontWeight: 800 }}>{m.vendor}</div>
                <div style={{ marginTop: 3 }}>{m.model}</div>
                <div style={{ color: "var(--text-muted)", marginTop: 3 }}>{m.surface}</div>
                <SourceLinks keys={m.sourceKeys} />
              </td>
              <td style={{ ...bodyCellStyle, width: 220 }}>{m.bestFor}</td>
              <td style={{ ...bodyCellStyle, width: 170 }}>{m.style}</td>
              <td style={{ ...bodyCellStyle, width: 230 }}>{m.cost}</td>
              <td style={{ ...bodyCellStyle, width: 190 }}>
                <div style={{ fontWeight: 800 }}>{m.speed}</div>
                <div style={{ color: "var(--text-muted)", marginTop: 6 }}>{m.context}</div>
              </td>
              <td style={{ ...bodyCellStyle, width: 230 }}>{m.strengths}</td>
              <td style={{ ...bodyCellStyle, width: 220 }}>{m.tradeoffs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodingToolsTable({ rows }: { rows: readonly CodingToolComparison[] }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--card-border)", borderRadius: 8 }}>
      <table style={{ width: "100%", minWidth: 1360, borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["工具 / 模型", "適合任務", "工作流", "成本", "速度 / Context", "優勢", "限制"].map((h) => (
              <th key={h} style={headCellStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={`${m.vendor}-${m.tool}`}>
              <td style={{ ...bodyCellStyle, width: 190 }}>
                <div style={{ fontWeight: 800 }}>{m.tool}</div>
                <div style={{ marginTop: 3 }}>{m.model}</div>
                <div style={{ color: "var(--text-muted)", marginTop: 3 }}>{m.surface}</div>
                <SourceLinks keys={m.sourceKeys} />
              </td>
              <td style={{ ...bodyCellStyle, width: 220 }}>{m.bestFor}</td>
              <td style={{ ...bodyCellStyle, width: 210 }}>{m.workflowStyle}</td>
              <td style={{ ...bodyCellStyle, width: 240 }}>{m.cost}</td>
              <td style={{ ...bodyCellStyle, width: 180 }}>
                <div style={{ fontWeight: 800 }}>{m.speed}</div>
                <div style={{ color: "var(--text-muted)", marginTop: 6 }}>{m.context}</div>
              </td>
              <td style={{ ...bodyCellStyle, width: 220 }}>{m.strengths}</td>
              <td style={{ ...bodyCellStyle, width: 220 }}>{m.tradeoffs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImageModelsTable({ rows }: { rows: readonly TarotModelComparison[] }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--card-border)", borderRadius: 8 }}>
      <table style={{ width: "100%", minWidth: 1480, borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["模型", "適合任務", "每張成本", "速度", "文字/圖片輸入", "比例/解析度", "風格控制", "優勢", "限制"].map((h) => (
              <th key={h} style={headCellStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td style={{ ...bodyCellStyle, width: 180 }}>
                <div style={{ fontWeight: 800 }}>{m.label}</div>
                <div style={{ marginTop: 3, color: "var(--text-muted)" }}>{m.provider} · {m.tier}</div>
                <ImageSourceLinks keys={m.sourceKeys} />
              </td>
              <td style={{ ...bodyCellStyle, width: 220 }}>
                <div>{m.bestFor}</div>
                <div style={{ color: "var(--text-muted)", marginTop: 6 }}>避開：{m.avoidFor}</div>
              </td>
              <td style={{ ...bodyCellStyle, width: 170 }}>
                <div style={{ fontWeight: 800 }}>US${m.costUsd.toFixed(3)}/張</div>
                <div style={{ marginTop: 2 }}>NT${ntd(m.costUsd)}/張</div>
                <div style={{ color: "var(--text-muted)", marginTop: 3, fontSize: 10.5 }}>{m.publicPrice}</div>
              </td>
              <td style={{ ...bodyCellStyle, width: 150 }}>{m.speed}</td>
              <td style={{ ...bodyCellStyle, width: 230 }}>
                <div>{m.promptLimit}</div>
                <div style={{ marginTop: 6 }}>參考圖：{m.appReferenceLimit}</div>
                <div style={{ color: "var(--text-muted)", marginTop: 3 }}>{m.referenceInput}</div>
              </td>
              <td style={{ ...bodyCellStyle, width: 220 }}>
                <div>{m.appOutput}</div>
                <div style={{ color: "var(--text-muted)", marginTop: 6 }}>{m.aspectRatios}</div>
              </td>
              <td style={{ ...bodyCellStyle, width: 180 }}>
                <div>{m.styleControl}</div>
                <div style={{ color: "var(--text-muted)", marginTop: 6 }}>seed：{m.seedSupport}</div>
                <div style={{ color: "var(--text-muted)", marginTop: 3 }}>文字：{m.textRendering}</div>
              </td>
              <td style={{ ...bodyCellStyle, width: 190 }}>{m.strengths}</td>
              <td style={{ ...bodyCellStyle, width: 190 }}>{m.tradeoffs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const headCellStyle = {
  textAlign: "left" as const,
  padding: "10px 12px",
  borderBottom: "1px solid var(--card-border)",
  color: "var(--text-muted)",
  fontSize: 10,
  letterSpacing: ".08em",
  textTransform: "uppercase" as const,
  whiteSpace: "nowrap" as const,
};

const bodyCellStyle = {
  padding: "12px",
  borderBottom: "1px solid var(--card-border)",
  verticalAlign: "top" as const,
  lineHeight: 1.45,
};

export default function AiModelGuidePage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">AI Model Guide</span>
        <span className="topbar-env">Text · Vibe coding · Updated 2026-06-15</span>
      </div>

      <div className="page">
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>AI 模型與工具比較</h1>
          <p className="form-hint">
            給 Content Tools 共用的選型表。價格以 API 公開價為主；ChatGPT、Claude、Gemini、Perplexity、Grok 的訂閱方案會受額度與地區影響。
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 18 }}>
          <SummaryCard label="文字主力" value="Claude Sonnet / GPT-5.4" detail="品質穩、成本可控，適合每日內容產線。" />
          <SummaryCard label="深度策略" value="GPT-5.5 / Opus 4.8" detail="複雜推理與長上下文，適合少量高價任務。" />
          <SummaryCard label="圖片模型" value="FLUX / Ideogram / Gemini" detail="共用於 Tarot、Studio、Mockup；成本看每張。" />
          <SummaryCard label="Coding Agent" value="Codex / Claude Code" detail="真正改 repo、跑測試、修 PR 時優先。" />
        </div>

        <section className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 15, margin: 0 }}>文字生成工具</h2>
              <div className="form-hint">比較 Gemini、Perplexity、ChatGPT/OpenAI、Claude、Grok 的模型能力、風格、字數成本與速度。</div>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>成本單位：USD / 1M tokens</div>
          </div>
          <TextModelsTable rows={TEXT_MODEL_COMPARISONS} />
        </section>

        <section className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 15, margin: 0 }}>圖片生成工具</h2>
              <div className="form-hint">比較 Tarot、Studio、Mockup 共用的 15 個生圖模型：風格、比例、參考圖、每張成本與速度。</div>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>成本：US$ (SSOT) / NT$ (換匯 1:{TWD_RATE})</div>
          </div>
          <ImageModelsTable rows={TAROT_MODEL_COMPARISONS} />
        </section>

        <section className="card">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 15, margin: 0 }}>Vibe Coding 工具</h2>
              <div className="form-hint">比較 Codex、Claude Code、Gemini Code Assist、Perplexity/Comet、Grok Build 的 coding 用途。</div>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>重點：改 repo 能力、速度、成本、成熟度</div>
          </div>
          <CodingToolsTable rows={CODING_TOOL_COMPARISONS} />
        </section>
      </div>
    </>
  );
}
