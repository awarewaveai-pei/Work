import Link from "next/link";
import AiModelsClient from "./AiModelsClient";
import ImageModelSpecs from "./ImageModelSpecs";

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

// Tabs are links (?tab=), so each tab has its own URL; /ops/ai-models redirects to the image-specs tab.
const TABS = [
  { key: "compare", label: "模型比較" },
  { key: "image-specs", label: "圖片模型規格" },
] as const;

export default async function AiModelGuidePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const active = tab === "image-specs" ? "image-specs" : "compare";
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">AI Model Guide</span>
        <span className="topbar-env">Text · Image · Coding · 2026-06-18</span>
      </div>

      <div className="page">
        <div className="tab-bar" role="tablist" style={{ marginBottom: 20 }}>
          {TABS.map((t) => (
            <Link key={t.key} href={t.key === "compare" ? "/tools/ai-models" : `/tools/ai-models?tab=${t.key}`}
              role="tab" aria-selected={active === t.key}
              className={active === t.key ? "tab tab--active" : "tab"} style={{ textDecoration: "none" }}>
              {t.label}
            </Link>
          ))}
        </div>

        {active === "image-specs" ? <ImageModelSpecs /> : <>
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
        </>}
      </div>
    </>
  );
}
