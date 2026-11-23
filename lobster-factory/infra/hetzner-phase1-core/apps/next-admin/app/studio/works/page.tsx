import DesignsGallery from "../../(shell)/tools/designs/DesignsGallery";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "我的作品" };

// studio.<base domain>/works: every finished piece, as staff open it at /tools/designs.
export default function StudioWorksPage() {
  return <><h1 style={SR_ONLY}>我的作品</h1><DesignsGallery /></>;
}
