import SuppressionClient from "./SuppressionClient";

export const metadata = { title: "Suppression · Cold Outreach" };

export default function SuppressionPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Suppression List 禁寄清單</span>
        <span className="topbar-env">寄送前必查 · 退訂/投訴/退信/手動拒收</span>
      </div>
      <SuppressionClient />
    </>
  );
}
