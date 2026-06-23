import LeadsClient from "./LeadsClient";

export const metadata = { title: "Leads · Cold Outreach" };

export default function LeadsPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Leads 冷名單庫</span>
        <span className="topbar-env">三分數 · 優先級 · 狀態 · Consent</span>
      </div>
      <LeadsClient />
    </>
  );
}
