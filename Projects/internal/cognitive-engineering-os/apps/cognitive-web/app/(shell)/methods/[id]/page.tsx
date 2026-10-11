import Link from "next/link";
import { notFound } from "next/navigation";
import { dirHref, goalOf, loadCatalog, runHref, shownAbbr, toolHref, toolsOfGoal, workflowHref } from "../../../../lib/catalog";
import { lessonHref } from "../../../../lib/lessons";

// A tool's own page (mockkit render_tool_pages, docs/mockups/home-mock.html article.tpage): what it does, how to start,
// what usually comes next, the workflows that use it, the common tools of its goal. Every line comes from the catalog.
// ?project=: a result page's ⑧ "先看它做什麼" (N-22) so 開始 still saves into that project, not a new one.
export default async function ToolPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ project?: string | string[] }> }) {
  const id = decodeURIComponent((await params).id);
  const project = (await searchParams).project;
  const catalog = await loadCatalog();
  const m = catalog.methods[id];
  if (!m) notFound();
  const goal = goalOf(catalog, id);
  const abbr = shownAbbr(m);
  const wfs = catalog.recipes.filter((r) => r.steps.includes(id));
  const common = goal.featured.filter((x) => x !== id);
  const lesson = lessonHref(id, "tool");
  return (
    <article className="tpage" id={`t-${id}`}>
      <div className="crumbs"><Link href="/methods">工具</Link> › <Link href={dirHref(goal.id)}>{goal.title_zh}</Link> › {m.name_zh}</div>
      <div className="top"><div><h1>{m.name_zh}{abbr && <> <small>{abbr}</small></>}</h1><div className="sub">{m.name_en}</div></div></div>
      <div className="card">
        <h2>它幫你做什麼</h2>
        <div className="how"><b>怎麼讀</b>第一句是它做什麼、什麼時候用；下面是做完常接的工具、用到它的工作流、同一類常用的工具，點名字就過去。<b>你要做的</b>像你的情況就按「開始」；{lesson ? "第一次用先上它的課；" : ""}不像就看同一類的其他工具。</div>
        <p className="lead">{m.blurb_zh}</p>
        <div className="btns"><Link className="btn primary" href={runHref(id, typeof project === "string" ? project : undefined)}>開始 →</Link>{lesson && <a className="btn" href={lesson} target="_blank" rel="noopener">第一次用？先上 5 分鐘的課 ↗</a>}</div>
        <h3 className="fam">做完常接</h3>
        {m.next.length ? (
          <p className="my6">{m.next.map((x, i) => <span key={x}>{i ? "、" : ""}{catalog.methods[x] ? <Link href={toolHref(x)}>{catalog.methods[x].name_zh}</Link> : <span className="k">尚未上架的工具（{x}）</span>}</span>)}</p>
        ) : (
          <p className="sub my6">這個工具沒有固定的下一步：看下面同一類常用的，或到<Link href="/analyze">直接分析</Link>說你卡在哪。</p>
        )}
        <h3 className="fam">用到它的工作流</h3>
        {wfs.length ? (
          <p className="my6">{wfs.map((r, i) => <span key={r.id}>{i ? "、" : ""}<Link href={workflowHref(r.id)}>{r.name_zh}</Link>{r.audience === "internal" ? "（平台維運用）" : ""}</span>)}</p>
        ) : (
          <p className="sub my6">目前沒有工作流用到它；它可以單獨用。</p>
        )}
        <h3 className="fam">同一類常用<small>{goal.title_zh}</small></h3>
        <p className="my6">{common.map((x, i) => <span key={x}>{i ? "、" : ""}<Link href={toolHref(x)}>{catalog.methods[x].name_zh}</Link></span>)}；<Link href={dirHref(goal.id)}>看這一類全部 {toolsOfGoal(catalog, goal).length} 個 →</Link></p>
      </div>
    </article>
  );
}
