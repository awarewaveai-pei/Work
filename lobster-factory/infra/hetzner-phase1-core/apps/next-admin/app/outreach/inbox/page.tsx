import { OutreachStub } from "../_components/OutreachStub";

export const metadata = { title: "Lead Inbox · Cold Outreach" };

export default function LeadInboxPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Lead Inbox 名單收件匣</span>
        <span className="topbar-env">匯入暫存 · 去重 · suppression 檢查</span>
      </div>
      <OutreachStub
        title="Lead Inbox"
        sub="所有來源（CSV / 手動 / Apify / Hunter / WordPress 表單）先進收件匣，不污染正式 Leads。"
        next={[
          "匯入 CSV 或手動新增名單",
          "審核高品質 lead → Approve to Leads",
          "標記重複 / 缺聯絡 / do_not_contact",
        ]}
      />
    </>
  );
}
