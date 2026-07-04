import VideoTabs from "./VideoTabs";

export const metadata = { title: "影片生成工具 · Lobster Factory" };

export default function VideoPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">影片生成工具</span>
        <span className="topbar-env">前製腳本 → 影片生產 · 一鍵接力出片</span>
      </div>
      <VideoTabs />
    </>
  );
}
