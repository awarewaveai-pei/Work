// /ops/cs — AI customer-service operations center (cross-client overview).
// Reads aggregate cs_* counts via the service-role client. Per-client config lives in the client
// hub「客服」tab; this is the agency-wide operational surface (mirrors the Cold Outreach center).
// Deeper sub-pages (knowledge / intents / eval) are stubbed in the sidebar until built.

import Link from "next/link";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadCounts(): Promise<{ intents: number; knowledge: number; replies: number } | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const [intents, knowledge, replies] = await Promise.all([
    sb.from("cs_intents").select("id", { count: "exact", head: true }),
    sb.from("cs_knowledge_sources").select("id", { count: "exact", head: true }),
    sb.from("cs_ai_replies").select("id", { count: "exact", head: true }),
  ]);
  if (intents.error || knowledge.error || replies.error) return null;
  return { intents: intents.count ?? 0, knowledge: knowledge.count ?? 0, replies: replies.count ?? 0 };
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: "var(--bg-canvas)", borderRadius: 10, padding: "14px 16px", minWidth: 140 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export default async function CustomerServiceOverview() {
  const c = await loadCounts();

  return (
    <div style={{ padding: "24px 28px", maxWidth: 920 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>AI 客服營運中心</h1>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 20px", lineHeight: 1.6 }}>
        跨客戶的客服營運面。每個客戶的知識庫 / 意圖 / kill-switch 在
        <Link href="/ops/clients" style={{ color: "var(--accent)", textDecoration: "none" }}> 客戶中心 → 客服分頁</Link>。
        對話載體 Chatwoot 待搬大記憶體機（U6）；cs-engine 與資料層（pgvector）已上線。
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <Metric label="意圖總數" value={c ? String(c.intents) : "—"} hint="cs_intents（跨客戶）" />
        <Link href="/ops/knowledge" style={{ textDecoration: "none" }}>
          {/* The knowledge base lives in its own section (ADR 011: customer service is one consumer
              of it, not its owner). Linked from here so an operator working on CS still lands on it. */}
          <Metric label="知識來源" value={c ? String(c.knowledge) : "—"} hint="看全部 →" />
        </Link>
        <Metric label="AI 回覆數" value={c ? String(c.replies) : "—"} hint="cs_ai_replies 稽核" />
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>架構狀態</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.9 }}>
          <li>✅ 資料層 migration 0051（8 表 + pgvector + RPC）已上 EU prod</li>
          <li>✅ cs-engine <code>lib/cs/</code>（RAG / 護欄 / tool-loop / 雙軸自主）</li>
          <li>✅ per-client CIS「品牌識別」+「客服」分頁（客戶中心）</li>
          <li>✅ <strong>操作介面：客戶中心 →「客服」分頁</strong>（餵知識庫 + 建意圖/設自動化分級 + kill-switch）；CIS 在「品牌識別」分頁</li>
          <li>⏳ Chatwoot 載體（headless widget + AgentBot webhook）— 待搬大記憶體機</li>
          <li>⏳ eval 儀表板 / 意圖畢業流（跨客戶總覽子頁建置中）</li>
        </ul>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/ops/clients" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ 客戶中心（per-client 客服設定）</Link>
        <Link href="/ops/costs" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ AI 成本帳本</Link>
        <Link href="/ops/system-modes" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>→ 全域 Kill Switch</Link>
      </div>
    </div>
  );
}
