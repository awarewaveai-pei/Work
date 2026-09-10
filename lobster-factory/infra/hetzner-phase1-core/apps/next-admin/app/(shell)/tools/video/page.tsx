import VideoTabs from "./VideoTabs";
import VideoPipeline from "./VideoPipeline";

export const metadata = { title: "影片生成工具 · Lobster Factory" };

// 2026-09-10：預設入口改成 VideoPipeline（真正的 10 步驟 stepper，見 VideoPipeline.tsx
// 開頭註解）。VideoTabs（舊的兩段式＋tab 導覽）保留在 ?advanced=1，供要繞過流程、
// 直接操作單一引擎的人使用——不砍既有路徑。
export default async function VideoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const advanced = params.advanced === "1";
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">影片生成工具</span>
        <span className="topbar-env">{advanced ? "進階模式 · 前製腳本 → 影片生產 · 一鍵接力出片" : "建立腳本 → 選模式 → 費用確認 → 生成 → 驗證 → 字幕 → QA → Release → 營運"}</span>
      </div>
      {advanced ? <VideoTabs /> : <VideoPipeline />}
    </>
  );
}
