import FollowupsClient from "./FollowupsClient";

export const metadata = { title: "追蹤 · 開發信" };

export default function FollowupsPage() {
  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0, fontFamily: "inherit" }}>追蹤</h1>
        <span className="topbar-env">逾期 / 今天 / 即將 · 跟進不漏</span>
      </div>
      <FollowupsClient />
    </>
  );
}
