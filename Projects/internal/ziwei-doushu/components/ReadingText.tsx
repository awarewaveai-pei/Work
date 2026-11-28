import { Fragment, type ReactNode } from 'react';
import { parseReading, type Inline, type Line } from '@/lib/ai/readingMarkdown';

/**
 * AI 解讀的排版顯示(lib/ai/readingMarkdown.ts 解析)。安全守衛:模型的字只會變成 React 文字節點,
 * 這個檔不得出現 dangerouslySetInnerHTML、href、src;唯一由內容來的屬性是 <ol start>,只會是 1–3 位數字
 * (lib/ai/readingMarkdown.test.ts 守)。
 * 樣式在 app/globals.css 的 .ai-reading(只用主題變數,跟著宿主佈景)。複製、列印得到的是去掉記號的字。
 */
export default function ReadingText({ text }: { text: string }) {
  return (
    <div className="ai-reading">
      {parseReading(text).map((b, i) => {
        switch (b.t) {
          case 'heading':
            return b.level === 1 ? <h3 key={i}>{inline(b.c)}</h3> : <h4 key={i}>{inline(b.c)}</h4>;
          case 'para':
            return <p key={i}>{lines(b.lines)}</p>;
          case 'quote':
            return <blockquote key={i}>{lines(b.lines)}</blockquote>;
          case 'code':
            return <pre key={i}>{b.lines.join('\n')}</pre>;
          case 'hr':
            return <hr key={i} />;
          case 'list': {
            const items = b.items.map((item, j) => <li key={j}>{lines(item)}</li>);
            return b.ordered ? (
              <ol key={i} start={b.start === 1 ? undefined : b.start}>
                {items}
              </ol>
            ) : (
              <ul key={i}>{items}</ul>
            );
          }
        }
      })}
    </div>
  );
}

function lines(ls: Line[]): ReactNode {
  return ls.map((l, i) => (
    <Fragment key={i}>
      {i > 0 ? <br /> : null}
      {inline(l)}
    </Fragment>
  ));
}

function inline(parts: Inline[]): ReactNode {
  return parts.map((p, i) => {
    if (p.t === 'text') return <Fragment key={i}>{p.v}</Fragment>;
    if (p.t === 'strong') return <strong key={i}>{inline(p.c)}</strong>;
    return <em key={i}>{inline(p.c)}</em>;
  });
}
