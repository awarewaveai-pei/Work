import StudioWorkbench from "./StudioWorkbench";

export const metadata = { title: "Design Studio · Lobster Factory" };

export default function StudioPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Design Studio</span>
      </div>
      <StudioWorkbench />
    </>
  );
}
