import SiteManagerStaff from "./SiteManagerStaff";

export const metadata = { title: "客戶網站" };

// Staff keep the name 客戶網站 (every client's sites); the content door calls its own page 我的網站 (blueprint §15A).
export default function SitesPage() {
  return <SiteManagerStaff heading={<h1 style={{ color: "var(--text-primary)", margin: 0, fontSize: 22 }}>客戶網站</h1>} />;
}
