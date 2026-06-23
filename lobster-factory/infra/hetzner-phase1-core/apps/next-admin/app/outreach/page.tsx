import { getOutreachCounts } from "@/lib/outreach/db";
import { OutreachStub } from "./_components/OutreachStub";

export const metadata = { title: "Cold Outreach · Dashboard" };
// Reads live counts from the co_* tables → must not be statically evaluated at build.
export const dynamic = "force-dynamic";

export default async function OutreachDashboardPage() {
  const counts = await getOutreachCounts();
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Cold Outreach 作戰中心</span>
        <span className="topbar-env">AI 冷拜訪 + FluentCRM 暖名單 · Phase 1</span>
      </div>

      <div className="card-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-label">冷名單 (co_leads)</div>
          <div className="card-value">{counts.leads}</div>
          <div className="card-sub">正式開發名單</div>
        </div>
        <div className="card">
          <div className="card-label">收件匣 (co_lead_inbox)</div>
          <div className="card-value">{counts.inbox}</div>
          <div className="card-sub">待審匯入名單</div>
        </div>
        <div className="card">
          <div className="card-label">Suppression</div>
          <div className="card-value">{counts.suppression}</div>
          <div className="card-sub">禁寄清單</div>
        </div>
      </div>

      <OutreachStub
        title="作戰中心"
        sub="每日從這裡開工：先處理回覆 → 跟進 → 審核草稿 → 補 Lead Inbox 缺漏 → 查暖名單同步與免費額度。"
        next={[
          "匯入第一批名單到 Lead Inbox",
          "建立 Service Profile（服務設定檔）",
          "到 Connectors 設定客戶 BYO 免費 API key（Gemini / Hunter / Apify）",
        ]}
      />
    </>
  );
}
