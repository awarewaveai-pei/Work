import ScriptForgePage from "./ScriptForgePage";

export const metadata = { title: "ScriptForge 腳本工具 · Lobster Factory" };

export default function Page() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">ScriptForge 腳本工具</span>
        <span className="topbar-env">24 個模組：寫腳本、鉤子、文案、提案；做好可以送社群或送影片</span>
      </div>
      <ScriptForgePage />
    </>
  );
}
