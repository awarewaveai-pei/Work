import { RunPage } from "../../../../../components/RunPage";
import { lessonHref } from "../../../../../lib/lessons";

// The run page: the client RunPage, given the tool's lesson page when it has one (looked up here, on the server, so
// the lessons never ship in the browser bundle).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  return <RunPage methodId={id} lesson={lessonHref(id, "tool")} />;
}
