import DesignsGallery from "./DesignsGallery";

export const metadata = { title: "我的設計 · Lobster Factory" };

export default function DesignsPage() {
  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0, fontFamily: "inherit" }}>我的設計</h1>
      </div>
      <DesignsGallery />
    </>
  );
}
