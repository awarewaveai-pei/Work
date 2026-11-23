import BannerStudioStaff from "./BannerStudioStaff";

export const metadata = { title: "橫幅 · Lobster Factory" };

export default function BannerPage() {
  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0, fontFamily: "inherit" }}>橫幅</h1>
      </div>
      <BannerStudioStaff />
    </>
  );
}
