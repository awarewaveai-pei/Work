import WorksGallery from "./WorksGallery";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "我的作品" };

// video.<base domain>/works: the finished pieces of the customer the workbench is switched to (/tools/designs lists them all).
export default function VideoWorksPage() {
  return <><h1 style={SR_ONLY}>我的作品</h1><WorksGallery /></>;
}
