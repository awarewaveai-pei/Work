import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ReadingText from '@/components/ReadingText';
import { parseInline, parseReading } from './readingMarkdown';

const html = (text: string) => renderToStaticMarkup(createElement(ReadingText, { text }));

describe('AI 解讀排版', () => {
  it('各種記號轉成結構,畫面上不留記號', () => {
    const out = html(
      [
        '## 命宮解讀',
        '你的**主星**是紫微,*帝星*坐命。',
        '第二行同段。',
        '',
        '### 小結',
        '- 事業:`穩`',
        '- 財運:[看這裡](https://x.example)',
        '  續行',
        '1. 第一',
        '2) 第二',
        '---',
        '> 引用一句',
        '```',
        'a **不轉** b',
        '```',
      ].join('\n'),
    );
    expect(out).toBe(
      '<div class="ai-reading">' +
        '<h3>命宮解讀</h3>' +
        '<p>你的<strong>主星</strong>是紫微,<em>帝星</em>坐命。<br/>第二行同段。</p>' +
        '<h4>小結</h4>' +
        '<ul><li>事業:穩</li><li>財運:看這裡<br/>續行</li></ul>' +
        '<ol><li>第一</li><li>第二</li></ol>' +
        '<hr/>' +
        '<blockquote>引用一句</blockquote>' +
        '<pre>a **不轉** b</pre>' +
        '</div>',
    );
  });

  it('空行隔開的編號清單照模型寫的數字接續', () => {
    expect(html('1. 性格\n\n2. 事業')).toBe('<div class="ai-reading"><ol><li>性格</li></ol><ol start="2"><li>事業</li></ol></div>');
  });

  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    '[點我](javascript:alert(1))',
    '**<b onclick="x()">粗</b>**',
    '## <iframe src="//evil"></iframe>',
    '- <a href="https://evil.example">x</a>',
    '7. <svg onload=alert(1)>',
  ])('惡意字串只是字,不變成元素或屬性:%s', (evil) => {
    const out = html(evil);
    // 內容裡的 < 都被轉成 &lt;,所以輸出裡每個真正的 < 都是元件自己的標籤:只准白名單、除外框 class 外沒有屬性
    const tags = [...out.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/g)];
    for (const [, closing, name, attrs] of tags) {
      expect(['div', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'hr', 'blockquote', 'pre']).toContain(name);
      const a = attrs.replace('/', '').trim();
      if (name === 'ol' && !closing) expect(a).toMatch(/^(start="\d{1,3}")?$/);
      else expect(a).toBe(name === 'div' && !closing ? 'class="ai-reading"' : '');
    }
    expect(out).not.toContain('javascript:');
  });

  it('串流半途:未閉合的記號照原文,閉合後才變樣式', () => {
    expect(parseInline('今天**運勢')).toEqual([{ t: 'text', v: '今天**運勢' }]);
    expect(parseInline('今天**運勢**')).toEqual([{ t: 'text', v: '今天' }, { t: 'strong', c: [{ t: 'text', v: '運勢' }] }]);
    expect(parseInline('*斜')).toEqual([{ t: 'text', v: '*斜' }]);
    expect(parseInline('***重點***')).toEqual([{ t: 'strong', c: [{ t: 'em', c: [{ t: 'text', v: '重點' }] }] }]);
    expect(parseReading('```\n```js\nomega\n```')).toEqual([{ t: 'code', lines: ['```js', 'omega'] }]);
    expect(parseInline('[字](https://x')).toEqual([{ t: 'text', v: '[字](https://x' }]);
    expect(parseInline('[連結](javascript:alert(1)) 後')).toEqual([{ t: 'text', v: '連結 後' }]);
    // 沒收尾的 ``` 不吞掉後面的文字
    expect(parseReading('```\n## 還在寫')).toEqual([
      { t: 'para', lines: [[{ t: 'text', v: '```' }]] },
      { t: 'heading', level: 1, c: [{ t: 'text', v: '還在寫' }] },
    ]);
    // 每一個前綴都畫得出來,文字不會不見
    const full = '## 標題\n內文**重點**與*語氣*\n- 項目一\n- 項目二';
    for (let n = 1; n <= full.length; n++) expect(() => html(full.slice(0, n))).not.toThrow();
  });
});
