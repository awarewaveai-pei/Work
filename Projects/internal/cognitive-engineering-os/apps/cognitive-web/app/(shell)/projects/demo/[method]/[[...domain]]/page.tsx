import { notFound } from "next/navigation";
import { DemoResult } from "../../../../../../components/DemoResult";
import { familyLabels, loadCatalog, toolNames } from "../../../../../../lib/catalog";
import { lessonHref } from "../../../../../../lib/lessons";
import { DEMO_FIXTURES, DEMOS } from "../../../../../../lib/toolsheets.generated";

// 示範分析 (template §6): a real analysis of a tool's demo case, read-only and free (gap report N-78).
// /projects/demo/<method> = the default domain's, /projects/demo/<method>/<domain> = another domain's. The data is the
// checked-in fixture (fixtures/demo/<method>.<domain>.json), regenerated from a real run by scripts/dev/demo_fixture.cjs --
// never hand-edited; DEMOS lists the ones that exist. Any other address is the not-found page; like every page under
// (shell), whose loading.tsx starts streaming first, its HTTP status is still 200 (TASKS.md: real 404 status app-wide).
export default async function Page({ params }: { params: Promise<{ method: string; domain?: string[] }> }) {
  const { method: raw, domain } = await params;
  const method = decodeURIComponent(raw);
  const base = `/projects/demo/${method}`;
  const entry = (DEMOS[method] ?? []).find((item) => (domain?.length === 1 ? item.domain === domain[0] && item.href !== base : !domain?.length && item.href === base));
  const load = entry && DEMO_FIXTURES[`${method}.${entry.domain}`];
  if (!load) notFound();
  const demo = (await load()).default as Parameters<typeof DemoResult>[0]["demo"];
  const catalog = await loadCatalog().catch(() => null);
  const names = toolNames(catalog);
  const lessons = Object.fromEntries(Object.keys(names).flatMap((key) => { const href = lessonHref(key, "tool"); return href ? [[key, href]] : []; }));
  return <DemoResult demo={demo} names={names} lessons={lessons} lesson={lessonHref(method, "tool")} families={familyLabels(catalog)} />;
}
