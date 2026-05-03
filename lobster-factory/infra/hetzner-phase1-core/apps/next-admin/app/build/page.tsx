import BuildConsole from "./BuildConsole";

export const dynamic = "force-dynamic";

export default function BuildPage() {
  return (
    <>
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
