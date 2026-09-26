import { ProjectPage } from "../../../../components/ProjectPage";
import { loadCatalog, toolNames } from "../../../../lib/catalog";

// One project: the client page (its analyses are the signed-in user's, read in the browser), given the tool names.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const catalog = await loadCatalog().catch(() => null);
  return <ProjectPage projectId={id} names={toolNames(catalog)} />;
}
