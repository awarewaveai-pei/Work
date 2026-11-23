import ConnectorsClient from "./ConnectorsClient";

export const metadata = { title: "信箱與連線 · 開發信" };

export default function ConnectorsPage() {
  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0, fontFamily: "inherit" }}>信箱與連線</h1>
        <span className="topbar-env">客戶 BYO free key · Free-Plan Router · Quota Guard</span>
      </div>
      <ConnectorsClient />
    </>
  );
}
