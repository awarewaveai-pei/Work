import ServiceProfilesClient from "./ServiceProfilesClient";

export const metadata = { title: "Service Profiles · Cold Outreach" };

export default function ServiceProfilesPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Service Profiles 服務設定檔</span>
        <span className="topbar-env">AI 文案的服務脈絡 + 禁用詞護欄</span>
      </div>
      <ServiceProfilesClient />
    </>
  );
}
