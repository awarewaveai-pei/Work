import VideoStudio from "./VideoStudio";

export const metadata = { title: "影片生成工具 · Lobster Factory" };

export default function VideoPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">影片生成工具</span>
        <span className="topbar-env">流程 · 成本 · 多平台尺寸輸出</span>
      </div>
      <VideoStudio />
    </>
  );
}
