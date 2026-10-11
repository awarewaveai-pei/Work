import Link from "next/link";
import type { ReactNode } from "react";
import { Glyph } from "../../../components/Svg";
import type { Catalog, Recipe } from "../../../lib/catalog";
import { loadCatalog, stations, toolHref } from "../../../lib/catalog";
import { lessonHref } from "../../../lib/lessons";

// 工作流 (mockkit render_workflows, docs/mockups/home-mock.html section#workflows): user workflows grouped by goal, the
// platform-internal ones folded at the end. A station that is a tool links to the tool; capability steps are text.
function WorkflowCard({ catalog, r }: { catalog: Catalog; r: Recipe }) {
  const goal = catalog.goals.find((g) => g.id === r.goal)!;
  const lesson = lessonHref(r.id, "workflow");
  const parts: ReactNode[] = [];
  stations(r.steps).forEach((s, i) => {
    if (i) parts.push(<i key={`a${i}`}>→</i>);
    parts.push("tool" in s
      ? <Link key={`s${i}`} href={toolHref(s.tool)}>{catalog.methods[s.tool].name_zh}</Link>
      : <span key={`s${i}`}>{s.capabilities === 1 ? "能力步" : `能力步 ×${s.capabilities}`}</span>);
  });
  return (
    <div className="mcard wf" id={`wf-${r.id}`}>
      <div className="gh"><Glyph paths={catalog.glyphs[goal.icon]} label={goal.short_zh} /><b>{r.name_zh}</b><span className="tag">{r.steps.length} 站</span></div>
      <div className="k">{r.name}</div>
      <div className="journey">{parts}</div>
      <div>{r.blurb_zh}</div>
      {lesson && <div className="btns"><a className="btn" href={lesson} target="_blank" rel="noopener">第一次走？先上 3 分鐘的課 ↗</a></div>}
    </div>
  );
}

export default async function WorkflowsPage() {
  const catalog = await loadCatalog();
  const user = catalog.recipes.filter((r) => r.audience === "user");
  // internal workflows (audience: internal) are not listed: they run engineering tools (ENTRY_SLICE1_CHECKLIST.md item 5)
  return (
    <section className="view" id="workflows">
      <div className="top"><div><h1>工作流</h1><div className="sub">幾個工具排好順序一次走完；上一站的結果自動變成下一站的輸入。</div></div></div>
      <div className="card" id="wf-list">
        <h2>工作流：一次走完幾個工具<small>{user.length} 條；上一站的結果自動變成下一站的輸入</small></h2>
        <div className="how"><b>怎麼讀</b>一張卡一條工作流，站列是它會依序跑的工具，按你想做的事分組；點站名看那個工具。<b>你要做的</b>看哪條像你的情況；工作流一站一站走的頁面正在做，先用站列裡的工具單獨開始。</div>
        {catalog.goals.map((goal) => {
          const rs = user.filter((r) => r.goal === goal.id);
          if (!rs.length) return null;
          return (
            <section className="wfgroup" key={goal.id}>
              <h3 className="fam">{goal.title_zh}<small>{rs.length} 條</small></h3>
              <div className="mcards">{rs.map((r) => <WorkflowCard key={r.id} catalog={catalog} r={r} />)}</div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
