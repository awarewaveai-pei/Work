import ConnectorsClient from "./ConnectorsClient";

export const metadata = { title: "Connectors · Cold Outreach" };

export default function ConnectorsPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Connectors 免費工具連接</span>
        <span className="topbar-env">客戶 BYO free key · Free-Plan Router · Quota Guard</span>
      </div>
      <ConnectorsClient />
    </>
  );
}
