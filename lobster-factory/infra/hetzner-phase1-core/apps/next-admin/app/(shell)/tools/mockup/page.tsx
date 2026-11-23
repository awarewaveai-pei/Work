import MockupWithCatalog from "./MockupWithCatalog";

export const metadata = { title: "模型圖 · Lobster Factory" };

export default function MockupPage() {
  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0, fontFamily: "inherit" }}>模型圖</h1>
      </div>
      <MockupWithCatalog />
    </>
  );
}
