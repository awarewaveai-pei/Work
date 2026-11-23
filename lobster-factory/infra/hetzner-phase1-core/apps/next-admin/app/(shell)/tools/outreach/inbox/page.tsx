import InboxClient from "./InboxClient";

export const metadata = { title: "匯入名單 · 開發信" };

export default function LeadInboxPage() {
  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0, fontFamily: "inherit" }}>匯入名單</h1>
        <span className="topbar-env">匯入暫存 · 去重 · suppression 檢查 · 機械評分</span>
      </div>
      <InboxClient />
    </>
  );
}
