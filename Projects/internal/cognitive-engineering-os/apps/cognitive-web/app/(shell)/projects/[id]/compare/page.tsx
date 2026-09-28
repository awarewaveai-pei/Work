import { ComparePage } from "../../../../../components/ComparePage";
import { loadCatalog, toolNames } from "../../../../../lib/catalog";

// Two analyses of one project side by side: ?a=<earlier>&b=<later>.
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string | string[]; b?: string | string[] }> }) {
  const id = decodeURIComponent((await params).id);
  const { a, b } = await searchParams;
  const catalog = await loadCatalog().catch(() => null);
  if (typeof a !== "string" || typeof b !== "string") return <div className="card"><p className="error">要比較的兩次分析沒有指定（網址要有 a 和 b）。</p></div>;
  return <ComparePage projectId={id} a={a} b={b} names={toolNames(catalog)} />;
}
