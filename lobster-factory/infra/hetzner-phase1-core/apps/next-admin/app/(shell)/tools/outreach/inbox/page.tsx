import InboxClient from "./InboxClient";

export const metadata = { title: "Lead Inbox · Cold Outreach" };

export default function LeadInboxPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Lead Inbox 名單收件匣</span>
        <span className="topbar-env">匯入暫存 · 去重 · suppression 檢查 · 機械評分</span>
      </div>
      <InboxClient />
    </>
  );
}
