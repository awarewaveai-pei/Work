import { OutreachStub } from "../_components/OutreachStub";

export const metadata = { title: "Follow-ups · Cold Outreach" };

export default function FollowupsPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Follow-ups 跟進任務</span>
        <span className="topbar-env">今天 / 本週 / 逾期 · 跟進不漏</span>
      </div>
      <OutreachStub
        title="Follow-ups"
        sub="到期跟進看板。dailyFollowupScan 每早把 next_followup_date ≤ today 的 lead 排進今日任務。"
        next={[
          "完成今日到期跟進",
          "延後 3 / 7 天或停止聯絡",
          "變暖的 lead 轉入 FluentCRM nurture",
        ]}
      />
    </>
  );
}
