import RepliesClient from "./RepliesClient";

export const metadata = { title: "回信 · Cold Outreach" };

export default function RepliesPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">回信</span>
        <span className="topbar-env">回信、退訂、退信 · 下一步</span>
      </div>
      <RepliesClient />
    </>
  );
}
