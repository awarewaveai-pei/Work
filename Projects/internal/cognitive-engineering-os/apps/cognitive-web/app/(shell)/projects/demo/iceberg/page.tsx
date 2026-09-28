import demo from "../../../../../fixtures/demo-iceberg.json";
import { DemoResult } from "../../../../../components/DemoResult";
import { familyLabels, loadCatalog, toolNames } from "../../../../../lib/catalog";
import { lessonHref } from "../../../../../lib/lessons";

// 示範專案: a real analysis of the demo case, read-only and free (gap report N-78). The data is the checked-in fixture,
// regenerated from a real run -- never hand-edited.
export default async function Page() {
  const catalog = await loadCatalog().catch(() => null);
  const names = toolNames(catalog);
  const lessons = Object.fromEntries(Object.keys(names).flatMap((key) => { const href = lessonHref(key, "tool"); return href ? [[key, href]] : []; }));
  return <DemoResult demo={demo} names={names} lessons={lessons} lesson={lessonHref("systems.iceberg_model", "tool")} families={familyLabels(catalog)} />;
}
