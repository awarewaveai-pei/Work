import { AnalysisPage } from "../../../../../../components/AnalysisPage";
import { loadCatalog, toolNames } from "../../../../../../lib/catalog";
import { lessonHref } from "../../../../../../lib/lessons";

// One saved analysis: the client page, given the tool names and each tool's lesson page (looked up here, on the server,
// so the lessons never ship in the browser bundle; which tool it is, the browser learns from the analysis itself).
export default async function Page({ params }: { params: Promise<{ id: string; analysis: string }> }) {
  const { id, analysis } = await params;
  const catalog = await loadCatalog().catch(() => null);
  const names = toolNames(catalog);
  const lessons = Object.fromEntries(Object.keys(names).flatMap((key) => { const href = lessonHref(key, "tool"); return href ? [[key, href]] : []; }));
  return <AnalysisPage projectId={decodeURIComponent(id)} analysisId={decodeURIComponent(analysis)} names={names} lessons={lessons} />;
}
