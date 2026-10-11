import React from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { projectHref, toolHref } from "../lib/catalog";
import { formatTime } from "../lib/time";

// The run page's header (docs/mockups/iceberg-result-mock.html: crumbs, then the first card = title + lesson button,
// tool line, status strip, 怎麼讀). One card before and after a result, so the page does not jump when the result lands.
// With a result the title carries the analysis's headline (冰山模型分析：團體反思 session 主動分享從 6 人掉到 2 人) and the
// tool line the project and the time (工具：冰山模型 Iceberg Model（系統思考 Systems Thinking）・專案「…」・時間). A tool with
// a lesson points to its 看懂結果 tab; a tool without one carries the reading guide here once there is a result
// (check-mocks.py U14: the guide lives in exactly one place).
export function RunHeader({ methodId, name, nameEn, family, headline, lesson, project, analyzedAt, status, guide = false, count = 0 }: {
  methodId: string; name: string; nameEn?: string; family?: string | null; headline?: string; lesson: string | null; project?: { id: string; name: string }; analyzedAt?: string; status: ReactNode; guide?: boolean; count?: number;
}) {
  const boxes = count ? `${["", "一", "兩", "三", "四", "五", "六", "七", "八", "九"][count] ?? count}格` : "格子";
  return <>
    <div className="crumbs"><Link href="/projects">我的案子</Link> › {project && <><Link href={projectHref(project.id)}>{project.name}</Link> › </>}{name}分析</div>
    <div className="card" data-section="0">
      <div className="top"><h1>{name}分析{headline ? <span>：{headline}</span> : null}</h1>{lesson
        ? <a className="howto" href={lesson} target="_blank" rel="noopener">怎麼用？先上 5 分鐘的課 ↗</a>
        : <Link className="howto" href={toolHref(methodId)}>它做什麼？</Link>}</div>
      <div className="sub">工具：{name}{nameEn ? ` ${nameEn}` : ""}{family ? `（${family}）` : ""}{project ? `・專案「${project.name}」` : ""}{analyzedAt ? `・${formatTime(analyzedAt)}` : ""}</div>
      <div className="status">{status}</div>
      {lesson
        ? <div className="how"><b>怎麼讀</b>上面填、下面看；每段的讀法在<a href={`${lesson}#panel-read`} target="_blank" rel="noopener">課程的「看懂結果」分頁 ↗</a>。<b>你要做的</b>填好或改好{boxes}，按「執行分析」。</div>
        : <div className="how"><b>怎麼讀</b>先填下面的格子，按「執行分析」；結果出現在格子下方。<b>你要做的</b>填不出來的留白；執行之前不花錢。</div>}
      {guide && !lesson && <>
        <p className="can"><b>能回答：</b>你填的內容支持哪些發現、各自多有把握。</p>
        <p className="cant"><b>不能回答：</b>你沒填的事實、沒查證的數字；也不會替你做決定。</p>
        <div className="todos"><p className="todo">① 讀 ① 的一句話和每個發現的信心</p><p className="todo">② 對照 ② 的圖和你填的內容</p><p className="todo">③ 看 ⑤ 的證據缺口和 ⑧ 的下一步，最後寫你的判斷</p></div>
        <p className="sub mb0">只有 30 秒？只讀 ① 的一句話和它的引註。</p>
        <p className="terms">四個詞：發現・引註・資料厚度・你的判斷</p>
      </>}
    </div>
  </>;
}
