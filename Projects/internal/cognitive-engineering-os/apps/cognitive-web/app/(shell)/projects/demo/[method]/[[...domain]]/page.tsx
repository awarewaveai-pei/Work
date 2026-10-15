import { notFound } from "next/navigation";
import { DemoResult } from "../../../../../../components/DemoResult";
import { familyLabels, loadCatalog, toolNames } from "../../../../../../lib/catalog";
import { demoOf } from "../../../../../../lib/known-address";
import { lessonHref } from "../../../../../../lib/lessons";

// 示範分析 (template §6): a real analysis of a tool's demo case, read-only and free (gap report N-78).
// /projects/demo/<method> = the default domain's, /projects/demo/<method>/<domain> = another domain's. The data is the
// checked-in fixture (fixtures/demo/<method>.<domain>.json), regenerated from a real run by scripts/dev/demo_fixture.cjs --
// never hand-edited; DEMOS lists the ones that exist. Any other address is the not-found page, status 404: middleware.ts
// asks the same demoOf before (shell)/loading.tsx starts streaming (lib/known-address.ts).
export default async function Page({ params }: { params: Promise<{ method: string; domain?: string[] }> }) {
  const { method: raw, domain } = await params;
  const method = decodeURIComponent(raw);
  const found = demoOf(method, domain);
  if (!found) notFound();
  const demo = (await found.load()).default as Parameters<typeof DemoResult>[0]["demo"];
  const catalog = await loadCatalog().catch(() => null);
  const names = toolNames(catalog);
  const lessons = Object.fromEntries(Object.keys(names).flatMap((key) => { const href = lessonHref(key, "tool"); return href ? [[key, href]] : []; }));
  return <DemoResult demo={demo} names={names} lessons={lessons} lesson={lessonHref(method, "tool")} families={familyLabels(catalog)} />;
}
