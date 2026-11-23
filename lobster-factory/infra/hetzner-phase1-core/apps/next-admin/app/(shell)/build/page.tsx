import BuildConsole from "./BuildConsole";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "部署執行" };

export const dynamic = "force-dynamic";

export default function BuildPage() {
  return (
    <>
      <h1 style={SR_ONLY}>部署執行</h1>
      <div className="topbar">
        <span className="topbar-title">Build Console</span>
        <span className="topbar-env">
          <span className="dot dot-yellow" />
          staging-first
        </span>
      </div>

      <div className="page">
        <BuildConsole />
      </div>
    </>
  );
}
