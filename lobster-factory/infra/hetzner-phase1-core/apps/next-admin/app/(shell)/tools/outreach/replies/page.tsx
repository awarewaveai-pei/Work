import RepliesClient from "./RepliesClient";

export const metadata = { title: "回信 · 開發信" };

export default function RepliesPage() {
  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0, fontFamily: "inherit" }}>回信</h1>
        <span className="topbar-env">回信、退訂、退信 · 下一步</span>
      </div>
      <RepliesClient />
    </>
  );
}
