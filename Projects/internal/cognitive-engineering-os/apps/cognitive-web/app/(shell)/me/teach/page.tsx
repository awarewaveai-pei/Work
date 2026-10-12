import { TeachPage } from "../../../../components/blocks/TeachPage";
import { loadCatalog, toolNames } from "../../../../lib/catalog";

// TEACH is a personal practice space. Its records use /me and are not attached to a case. The catalog gives the lesson
// subjects (tool ids) their Chinese names; without a catalog toolLabel says so rather than showing an id.
export default async function Page() {
  const catalog = await loadCatalog().catch(() => null);
  return <TeachPage names={toolNames(catalog)} />;
}
