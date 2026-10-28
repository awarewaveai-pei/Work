import VideoTabs from "./VideoTabs";
import VideoPipeline from "./VideoPipeline";

export const metadata = { title: "影片生成工具 · Lobster Factory" };

// 預設入口＝VideoPipeline（影片專案 5 步，?project=<id>；VIDEO_TOOL_REDESIGN V1.4）。VideoTabs（舊兩段式＋tab）
// 留在 ?advanced=1，給要直接操作單一引擎的人；沒有專案的舊影片只在那裡的「生成記錄」與 My Designs 看得到。
export default async function VideoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const advanced = params.advanced === "1";
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">影片生成工具</span>
        <span className="topbar-env">{advanced ? "進階模式 · 前製腳本 → 影片生產 · 一鍵接力出片" : "腳本 → 設定與費用 → 生成與修圖 → 審片 → 發布"}</span>
      </div>
      {advanced ? <VideoTabs /> : <VideoPipeline />}
    </>
  );
}
