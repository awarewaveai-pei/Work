import OnboardWizard from "./OnboardWizard";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "建站精靈" };

export default function OnboardPage() {
  return (
    <>
      <h1 style={SR_ONLY}>建站精靈</h1>
      <div className="topbar">
        <span className="topbar-title">New Client Onboarding</span>
        <span className="topbar-env">
          <span className="dot dot-green" />
          lobster-factory
        </span>
      </div>
      <div className="page">
        <div className="section-title">客戶上線精靈（4 步驟）</div>
        <p className="form-hint" style={{ marginBottom: 20, maxWidth: 640 }}>
          依序完成：客戶資訊 → 部門選型（M3）→ 開通服務帳號 → 啟動 Build Console。
          完成後可直接跳轉到 Build Console 並自動帶入所有必填欄位。
        </p>
        <OnboardWizard />
      </div>
    </>
  );
}
