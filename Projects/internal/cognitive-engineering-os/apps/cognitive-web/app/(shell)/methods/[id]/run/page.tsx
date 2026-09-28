import { RunPage } from "../../../../../components/RunPage";
import { familyLabel, loadCatalog, toolNames } from "../../../../../lib/catalog";
import { lessonHref } from "../../../../../lib/lessons";

// The run page: the client RunPage, given the tool's lesson page when it has one (looked up here, on the server, so
// the lessons never ship in the browser bundle), every tool's lesson page and name for the next steps (without a catalog:
// the ids), the tool's family, and the project the analysis goes into (?project=, from a project page; without it a new project).
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ project?: string | string[] }> }) {
  const id = decodeURIComponent((await params).id);
  const project = (await searchParams).project;
  const catalog = await loadCatalog().catch(() => null);
  const names = toolNames(catalog);
  const lessons = Object.fromEntries(Object.keys(names).flatMap((key) => { const href = lessonHref(key, "tool"); return href ? [[key, href]] : []; }));
  return <RunPage methodId={id} lesson={lessonHref(id, "tool")} lessons={lessons} names={names} family={familyLabel(catalog, id)} projectId={typeof project === "string" ? project : ""} />;
}
