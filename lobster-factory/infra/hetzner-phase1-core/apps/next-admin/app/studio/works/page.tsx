import DesignsGallery from "../../(shell)/tools/designs/DesignsGallery";

export const metadata = { title: "我的作品" };

// studio.<base domain>/works: every finished piece, as staff open it at /tools/designs.
export default function StudioWorksPage() {
  return <DesignsGallery />;
}
