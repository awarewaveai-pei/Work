import WorkbenchEntry from "./WorkbenchEntry";

export const metadata = { title: "影片工作台 · Lobster Factory" };

// The old video tool now lives in the video workbench (video-unify-plan-20261116 §4 U11): this page only opens it.
export default function VideoPage() {
  return <WorkbenchEntry open={null} />;
}
