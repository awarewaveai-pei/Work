import { RunPage } from "../../../../../components/RunPage";
import { loadCatalog } from "../../../../../lib/catalog";
import { lessonHref } from "../../../../../lib/lessons";

// The run page: the client RunPage, given the tool's lesson page when it has one (looked up here, on the server, so
// the lessons never ship in the browser bundle) and the tool names its next steps show (without them: the ids).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const catalog = await loadCatalog().catch(() => null);
  const names = catalog ? Object.fromEntries(Object.entries(catalog.methods).map(([key, method]) => [key, method.name_zh])) : {};
  return <RunPage methodId={id} lesson={lessonHref(id, "tool")} names={names} />;
}
