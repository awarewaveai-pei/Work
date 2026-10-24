import VideoTabs from "../(shell)/tools/video/VideoTabs";
import VideoPipeline from "../(shell)/tools/video/VideoPipeline";

export const metadata = { title: "影片製作" };

// video.<base domain>/ -> /video (middleware.ts); the same pipeline staff open at /tools/video, ?advanced=1 included.
export default async function VideoDoorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return params.advanced === "1" ? <VideoTabs /> : <VideoPipeline />;
}
