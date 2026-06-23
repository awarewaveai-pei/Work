import { OutreachStub } from "../_components/OutreachStub";

export const metadata = { title: "Leads · Cold Outreach" };

export default function LeadsPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Leads 冷名單庫</span>
        <span className="topbar-env">三分數 · 優先級 · 狀態 · Consent</span>
      </div>
      <OutreachStub
        title="Leads"
        sub="正式開發名單。AI 評分（quality / contactability / ICP）後依優先級排序。"
        next={[
          "對高分 lead 生成冷信文案",
          "加入 Campaign",
          "設定 Follow-up 日期",
        ]}
      />
    </>
  );
}
