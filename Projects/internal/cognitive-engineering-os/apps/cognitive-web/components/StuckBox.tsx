"use client";

// 先說你卡在哪 (mock home, plan U16): write a sentence or tap an example situation; 幫我挑 answers with at most three
// tools. Today this is the free first layer only -- words of the sentence matched against each tool's name and one
// line, and the reason names the matched words. The AI second layer (route.method) lands in P3; until then a sentence
// that matches nothing says so and points to the goal cards instead of guessing.
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Catalog } from "../lib/catalog";
import { isUserTool, runHref, toolHref } from "../lib/catalog";

type Pick = { id: string; hits: string[] };

/** Terms of a sentence: CJK runs split into 2-char pieces (Chinese has no spaces), latin words as they are. */
export function termsOf(text: string): string[] {
  const out = new Set<string>();
  for (const run of text.toLowerCase().match(/[一-鿿]+|[a-z0-9]{2,}/g) ?? []) {
    if (/^[a-z0-9]+$/.test(run)) { out.add(run); continue; }
    for (let i = 0; i + 2 <= run.length; i += 1) out.add(run.slice(i, i + 2));
  }
  return [...out];
}

export function pickTools(catalog: Catalog, text: string, limit = 3): Pick[] {
  const terms = termsOf(text);
  if (!terms.length) return [];
  return Object.entries(catalog.methods)
    .map(([id, m]) => ({ id, hits: terms.filter((t) => `${m.name_zh} ${m.blurb_zh} ${m.name_en}`.toLowerCase().includes(t)) }))
    .filter((x) => x.hits.length > 0 && isUserTool(catalog, x.id))
    .sort((a, b) => b.hits.length - a.hits.length || a.id.localeCompare(b.id))
    .slice(0, limit);
}

// initial: the sentence written on the home page (直接分析 ?q=), already asked so its picks show at once.
export function StuckBox({ catalog, project, initial = "" }: { catalog: Catalog; project?: string; initial?: string }) {
  const [text, setText] = useState(initial);
  const [asked, setAsked] = useState(initial.trim());
  const picks = useMemo(() => (asked ? pickTools(catalog, asked) : []), [catalog, asked]);
  return (
    <div className="card">
      <h2>先說你卡在哪<small>不用知道工具名；系統幫你挑，最多三個建議</small></h2>
      <div className="how"><b>怎麼讀</b>用你的話寫一兩句；下面幾顆是別人常遇到的情況，按一下就填進去。系統先用工具資料免費比對，每個建議都說為什麼。<b>你要做的</b>寫完按「幫我挑」；看建議時先看「為什麼」那一句對不對。</div>
      <textarea id="ask" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="例：團體課後半段大家都不講話，換了帶領者也一樣" aria-label="描述你卡在哪" />
      <p className="sub my6">常見的情況（按一下就填入）：</p>
      <div className="btns" id="prompts">
        {catalog.prompts.map((p) => <button key={p} className="btn ghost" type="button" data-prompt={p} onClick={() => setText(p)}>{p}</button>)}
      </div>
      <div className="btns mt8"><button className="btn primary" type="button" onClick={() => setAsked(text.trim())} disabled={!text.trim()}>幫我挑<small>最多三個建議；先免費比對工具資料</small></button></div>
      {asked && (picks.length ? (
        <div className="mcards mt10" aria-live="polite">
          {picks.map((p, i) => {
            const m = catalog.methods[p.id];
            return (
              <div className="mcard" key={p.id}>
                <div><b>{i + 1} <Link href={toolHref(p.id)}>{m.name_zh}</Link></b><span className="tag">工具</span></div>
                <div><span className="k">為什麼：</span>工具資料裡有「{p.hits.slice(0, 4).join("」「")}」；{m.blurb_zh}</div>
                <div className="btns"><Link className="btn primary" href={runHref(p.id, project)}>開始 →</Link><Link className="btn" href={toolHref(p.id, project)}>看它做什麼</Link></div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="sub mt10" aria-live="polite">工具資料裡比不到這句話的字。請換個說法，或從下面「按你想做的事找」的問句進去；用 AI 幫你挑的功能還在做。</p>
      ))}
    </div>
  );
}
