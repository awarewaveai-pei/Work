import DesignsGallery from "../(shell)/tools/designs/DesignsGallery";

export const metadata = { title: "我的設計" };

// design.<base domain>/ -> /design: My Designs, as staff open it at /tools/designs.
export default function DesignDoorPage() {
  return <DesignsGallery />;
}
