import Link from "next/link";
import { Glyph, Picture } from "../../../components/Svg";
import { StuckBox } from "../../../components/StuckBox";
import { dirHref, goalOf, loadCatalog, runHref, toolHref, toolsOfGoal, userGoals } from "../../../lib/catalog";
import { lessonHref } from "../../../lib/lessons";

// 直接分析 (ENTRY_SLICE1_CHECKLIST.md item 4): what the home page was until 2026-10-11 -- 先說你卡在哪, the goal cards,
// the popular starts -- moved behind the home page's 直接分析 door. ?q= is the sentence written on the home page;
// ?project= is a result page's ⑧ "不確定選哪個？" link (N-24) so a pick made here still saves into that project.
// Engineering goals are not listed (userGoals).
export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ project?: string | string[]; q?: string | string[] }> }) {
  const catalog = await loadCatalog();
  const params = await searchParams;
  const project = typeof params.project === "string" ? params.project : undefined;
  const asked = typeof params.q === "string" ? params.q.slice(0, 2000) : "";
  const { counts, popular, methods, recipes, glyphs, shapes } = catalog;
  const goals = userGoals(catalog);
  return (
    <section className="view" id="analyze">
      <div className="top">
        <div>
          <h1>直接分析</h1>
          <div className="sub">挑一個做法，填幾個格子，AI 直接給你一份分析。結果是 AI 做的，不是你的判斷；想深入，可以把它帶進案子，自己想清楚。</div>
        </div>
      </div>

      <StuckBox catalog={catalog} project={project} initial={asked} />

      <div className="card" id="goals">
        <h2>按你想做的事找<small>{goals.length} 種你可能想做的事；每一種先給三個常用工具</small></h2>
        <div className="how"><b>怎麼讀</b>每張卡是一件你可能想做的事，用問句寫；「常用」是這一類最常被用的三個工具，滑過去看它做什麼；「看全部」打開這一類的完整清單。<b>你要做的</b>找到最像你的那個問句，按一個工具；都不像就回到上面說你卡在哪。</div>
        <div className="mcards">
          {goals.map((goal) => {
            const ids = toolsOfGoal(catalog, goal);
            const wfs = recipes.filter((r) => r.goal === goal.id && r.audience === "user");
            return (
              <div className="mcard goal" id={`goal-${goal.id}`} key={goal.id}>
                <div className="gh"><Glyph paths={glyphs[goal.icon]} label={goal.short_zh} /><b>{goal.title_zh}</b></div>
                <div>{goal.blurb_zh}</div>
                <div className="k">{ids.length} 個工具{wfs.length ? `・${wfs.length} 條工作流` : ""}</div>
                <div><span className="k">常用：</span>{goal.featured.map((id, i) => <span key={id}>{i ? "、" : ""}<Link href={toolHref(id, project)} title={methods[id].blurb_zh}>{methods[id].name_zh}</Link></span>)}</div>
                <div className="btns"><Link className="btn" href={dirHref(goal.id)}>看全部 {ids.length} 個 →</Link></div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" id="popular">
        <h2>先從這幾個開始<small>{popular.length} 個最常見的起點（人工挑選；有使用資料後改成大家最常用的）</small></h2>
        <div className="how"><b>怎麼讀</b>每張卡一個工具：小圖是它長的樣子，一句話是它幫你做什麼，標籤是它屬於哪一件你想做的事。<b>你要做的</b>看到像你的情況就按「開始」。</div>
        <div className="mcards">
          {popular.map((p) => {
            const m = methods[p.id];
            const lesson = lessonHref(p.id, "tool");
            return (
              <div className="mcard pop" id={`pop-${p.id}`} key={p.id}>
                <div className="gh"><Picture paths={shapes[p.shape]} label={`${m.name_zh}的樣子`} /><div><b><Link href={toolHref(p.id, project)}>{m.name_zh}</Link></b><span className="tag">{goalOf(catalog, p.id).short_zh}</span><div className="k">{m.name_en}</div></div></div>
                <div>{p.line_zh}</div>
                <div className="btns"><Link className="btn primary" href={runHref(p.id, project)}>開始 →</Link>{lesson
                  ? <a className="btn" href={lesson} target="_blank" rel="noopener">第一次用？先上 5 分鐘的課 ↗</a>
                  : <Link className="btn" href={toolHref(p.id, project)}>看它做什麼</Link>}</div>
              </div>
            );
          })}
        </div>
        <p className="sub mt8 mb0">另外有 {counts.user_workflows} 條工作流，一次走完幾個工具：<Link href="/workflows">看工作流 →</Link>　知道工具名字：<Link href="/methods">到工具目錄搜 →</Link></p>
      </div>
    </section>
  );
}
