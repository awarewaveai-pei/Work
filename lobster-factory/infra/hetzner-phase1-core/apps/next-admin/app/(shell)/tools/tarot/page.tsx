import TarotStudioStaff from "./TarotStudioStaff";

export const metadata = { title: "塔羅工作台 · Lobster Factory" };

export default function TarotToolPage() {
  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0, fontFamily: "inherit" }}>塔羅工作台</h1>
      </div>
      <TarotStudioStaff />
    </>
  );
}
