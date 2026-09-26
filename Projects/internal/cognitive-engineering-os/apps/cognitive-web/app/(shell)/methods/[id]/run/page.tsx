import { RunPage } from "../../../../../components/RunPage";
import { loadCatalog, toolNames } from "../../../../../lib/catalog";
import { lessonHref } from "../../../../../lib/lessons";

// The run page: the client RunPage, given the tool's lesson page when it has one (looked up here, on the server, so
// the lessons never ship in the browser bundle), the tool names its next steps show (without them: the ids), and the
// project the analysis goes into (?project=, from a project page; without it a new project).
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ project?: string | string[] }> }) {
  const id = decodeURIComponent((await params).id);
  const project = (await searchParams).project;
  const catalog = await loadCatalog().catch(() => null);
  return <RunPage methodId={id} lesson={lessonHref(id, "tool")} names={toolNames(catalog)} projectId={typeof project === "string" ? project : ""} />;
}
