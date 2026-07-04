import SiteManager from "./SiteManager";

export const metadata = { title: "WordPress 網站管理 | AwareWave" };

export default function SitesPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">WordPress 網站管理</span>
        <span className="topbar-env">新增、編輯、移除客戶 WP 連線</span>
      </div>
      <SiteManager />
    </>
  );
}
