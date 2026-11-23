import LeadsClient from "./LeadsClient";

export const metadata = { title: "名單 · 開發信" };

export default function LeadsPage() {
  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0, fontFamily: "inherit" }}>名單</h1>
        <span className="topbar-env">三分數 · 優先級 · 狀態 · Consent</span>
      </div>
      <LeadsClient />
    </>
  );
}
