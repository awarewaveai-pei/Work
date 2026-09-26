import { ToolDirectory } from "../../../components/ToolDirectory";
import { loadCatalog } from "../../../lib/catalog";

// 工具 (docs/mockups/home-mock.html section#tools): every tool, folded by goal, with the name search.
export default async function ToolsPage() {
  const catalog = await loadCatalog();
  return (
    <section className="view" id="tools">
      <div className="top"><div><h1>工具</h1><div className="sub">每一個都能單獨用；按你想做的事分類，知道名字就直接搜。</div></div></div>
      <div className="card" id="directory"><ToolDirectory catalog={catalog} /></div>
    </section>
  );
}
