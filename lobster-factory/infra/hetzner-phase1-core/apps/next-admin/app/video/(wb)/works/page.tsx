import WorksGallery from "./WorksGallery";

export const metadata = { title: "我的作品" };

// video.<base domain>/works: the finished pieces of the customer the workbench is switched to (/tools/designs lists them all).
export default function VideoWorksPage() {
  return <WorksGallery />;
}
