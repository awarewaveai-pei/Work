import StudioWorkbench from "./StudioWorkbench";

export const metadata = { title: "設計工作台 · Lobster Factory" };

export default function StudioPage() {
  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0, fontFamily: "inherit" }}>設計工作台</h1>
      </div>
      <StudioWorkbench />
    </>
  );
}
