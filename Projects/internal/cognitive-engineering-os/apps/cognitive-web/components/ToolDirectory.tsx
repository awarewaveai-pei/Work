"use client";

// 全部 N 個工具 (mockkit render_directory): every tool once, folded by goal, the name search on top. A search opens the
// groups that have a hit and hides the rest; the count says how many are left.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Catalog } from "../lib/catalog";
import { shownAbbr, toolHref, toolSearchKey, toolsOfGoal, userGoals, userToolCount } from "../lib/catalog";

export function ToolDirectory({ catalog }: { catalog: Catalog }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {   // /methods#dir-<goal> (a goal card's 看全部) opens that group
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id.startsWith("dir-")) { setOpen(id.slice(4)); document.getElementById(id)?.scrollIntoView(); }
  }, []);
  const q = query.trim().toLowerCase();
  const groups = userGoals(catalog).map((goal) => {   // engineering tools are not listed (ENTRY_SLICE1_CHECKLIST.md item 5)
    const items = toolsOfGoal(catalog, goal)
      .sort((a, b) => (catalog.methods[a].name_zh < catalog.methods[b].name_zh ? -1 : catalog.methods[a].name_zh > catalog.methods[b].name_zh ? 1 : 0))   // code-point order, as mockkit sorted()
      .filter((id) => !q || toolSearchKey(id, catalog.methods[id]).includes(q));
    return { goal, items, total: toolsOfGoal(catalog, goal).length };
  });
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <>
      <h2>全部 {userToolCount(catalog)} 個工具<small>按你想做的事分 {userGoals(catalog).length} 類；點開一類，或直接搜名字</small></h2>
      <div className="how"><b>怎麼讀</b>每一類摺起來，標題就是「直接分析」問句卡上的問句；點開是這一類的全部工具，每列中文名（縮寫）、英文名、一句話。<b>你要做的</b>知道名字就在下面搜，符合的類別會自動打開；不知道名字就到「直接分析」，從問句卡或「先說你卡在哪」進去。</div>
      <input className="search" id="q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="知道名字就直接搜：SWOT、冰山、五力、決策樹…" aria-label="搜尋工具" />
      <p className="sub my6" id="hits" aria-live="polite">{q ? <>符合 <span id="mcount">{shown}</span> 個工具</> : <>共 <span id="mcount">{shown}</span> 個工具</>}</p>
      {groups.map(({ goal, items, total }) => (q && !items.length) ? null : (
        <details className="dir" id={`dir-${goal.id}`} data-dir={goal.id} key={goal.id} open={Boolean(q) || open === goal.id}>
          <summary><b>{goal.title_zh}</b><small>{q ? `${items.length} / ${total}` : total} 個</small></summary>
          {items.map((id) => {
            const m = catalog.methods[id];
            const abbr = shownAbbr(m);
            return (
              <div className="tool" id={`m-${id}`} key={id}>
                <b><Link href={toolHref(id)}>{m.name_zh}</Link>{abbr && <> <small>{abbr}</small></>}</b><span className="k">{m.name_en}</span>
                <div className="sub">{m.blurb_zh}</div>
              </div>
            );
          })}
        </details>
      ))}
      {q && !shown && <p className="sub">沒有名字或說明含「{query.trim()}」的工具；換個說法，或回首頁說你卡在哪。</p>}
    </>
  );
}
