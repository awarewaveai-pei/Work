import { ProjectList } from "../../../components/ProjectList";
import { loadCatalog, toolNames } from "../../../lib/catalog";

// 我的案子: the client list (the projects are the signed-in user's, read in the browser), given the tool names.
export default async function Page() {
  const catalog = await loadCatalog().catch(() => null);
  return <ProjectList names={toolNames(catalog)} />;
}
