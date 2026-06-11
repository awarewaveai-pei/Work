import DesignsGallery from "./DesignsGallery";

export const metadata = { title: "My Designs · Lobster Factory" };

export default function DesignsPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">My Designs</span>
      </div>
      <DesignsGallery />
    </>
  );
}
