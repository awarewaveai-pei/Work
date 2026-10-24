import BannerStudioStaff from "./BannerStudioStaff";

export const metadata = { title: "Banner Studio · Lobster Factory" };

export default function BannerPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Banner Studio</span>
      </div>
      <BannerStudioStaff />
    </>
  );
}
