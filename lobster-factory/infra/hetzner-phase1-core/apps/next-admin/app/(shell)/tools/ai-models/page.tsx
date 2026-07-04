import AiModelsClient from "./AiModelsClient";

export const metadata = { title: "AI Model Guide · Lobster Factory" };

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={{ border:"1px solid var(--card-border)", borderRadius:8, background:"var(--bg-subtle)", padding:"12px 14px" }}>
      <div style={{ fontSize:10, color:"var(--text-muted)", fontWeight:800, letterSpacing:".08em", textTransform:"uppercase" }}>{label}</div>
      <div style={{ fontSize:15, fontWeight:800, color:"var(--text-primary)", marginTop:5 }}>{value}</div>
      <div style={{ fontSize:11.5, color:"var(--text-muted)", lineHeight:1.45, marginTop:3 }}>{detail}</div>
    </div>
  );
}

export default function AiModelGuidePage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">AI Model Guide</span>
        <span className="topbar-env">Text · Image · Coding · 2026-06-18</span>
      </div>

      <div className="page">
        <div style={{ marginBottom:16 }}>
          <h1 style={{ fontSize:22, margin:"0 0 4px" }}>AI 模型比較</h1>
          <p className="form-hint">
            價格以 API 公開價為主。成本標籤：$ = 最便宜，$$$$ = 最貴。速度標籤：最快 → 慢。
          </p>
        </div>

        {/* Quick picks */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10, marginBottom:20 }}>
          <SummaryCard label="文字主力"   value="Claude Sonnet / GPT-5.4"  detail="品質穩、成本可控，適合每日產線。" />
          <SummaryCard label="深度推理"   value="GPT-5.5 / Claude Opus 4.8" detail="複雜任務與長上下文，少量高價場景。" />
          <SummaryCard label="圖片主力"   value="FLUX / Ideogram / Nano Banana" detail="Tarot/Studio/Mockup 共用；依成本選。" />
          <SummaryCard label="Coding Agent" value="Codex / Claude Code"    detail="真正改 repo、跑測試、修 PR 時優先。" />
        </div>

        {/* Interactive comparison */}
        <AiModelsClient />
      </div>
    </>
  );
}
