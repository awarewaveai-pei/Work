import FollowupsClient from "./FollowupsClient";

export const metadata = { title: "Follow-ups · Cold Outreach" };

export default function FollowupsPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Follow-ups 跟進任務</span>
        <span className="topbar-env">逾期 / 今天 / 即將 · 跟進不漏</span>
      </div>
      <FollowupsClient />
    </>
  );
}
