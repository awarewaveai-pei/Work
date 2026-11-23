import DesignsGallery from "../(shell)/tools/designs/DesignsGallery";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "我的設計" };

// design.<base domain>/ -> /design: My Designs, as staff open it at /tools/designs.
export default function DesignDoorPage() {
  return <><h1 style={SR_ONLY}>我的設計</h1><DesignsGallery /></>;
}
