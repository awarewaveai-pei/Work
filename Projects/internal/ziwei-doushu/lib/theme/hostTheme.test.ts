import { describe, expect, it } from 'vitest';
import { hostThemeCss, parseHostTheme } from './hostTheme';

describe('宿主主題代碼(安全邊界)', () => {
  it('合格值套用', () => {
    const t = parseHostTheme({
      'aw-bg': '#ffffff',
      'aw-text': 'rgb(26, 32, 44)',
      'aw-muted': 'hsl(210deg 10% 40% / 0.9)',
      'aw-font': "'Noto Sans TC', Inter, sans-serif",
      'aw-radius': '6px',
    });
    expect(t).toEqual({
      bg: '#ffffff',
      text: 'rgb(26, 32, 44)',
      muted: 'hsl(210deg 10% 40% / 0.9)',
      font: '"Noto Sans TC", "Inter", sans-serif',
      radius: '6px',
    });
    const css = hostThemeCss(t);
    expect(css.startsWith(':root:root{--aw-bg:#ffffff;')).toBe(true);
    expect(css).toContain('--aw-font:"Noto Sans TC", "Inter", sans-serif, var(--font-geist-sans)');
  });

  it('不合格值退回預設(該項不輸出),沒有任何代碼就不輸出 <style>', () => {
    const t = parseHostTheme({
      'aw-bg': 'red',
      'aw-accent': '#12345',
      'aw-radius': '12',
      'aw-font': 'inherit',
      'aw-heading': ['#fff', '#000'],
      'aw-unknown': '#fff',
    });
    expect(t).toEqual({});
    expect(hostThemeCss(t)).toBe('');
  });

  it.each([
    ['aw-bg', '#fff;}body{display:none'],
    ['aw-bg', 'rgb(1,2,3);color:red'],
    ['aw-surface', 'url(https://evil.example/x.png)'],
    ['aw-text', '</style><script>alert(1)</script>'],
    ['aw-accent', 'rgb(1,2,3)/**/'],
    ['aw-font', 'Inter;}*{x:y'],
    ['aw-font', 'Inter", url(x)'],
    ['aw-font', 'x</style><script>alert(1)</script>'],
    ['aw-font', 'Inter\\3b'],
    ['aw-radius', '4px;}'],
    ['aw-radius', 'calc(1px + url(x))'],
  ])('拒絕可執行或跳脫的值 %s=%s', (key, value) => {
    const t = parseHostTheme({ [key]: value });
    expect(t).toEqual({});
    expect(hostThemeCss(t)).toBe('');
  });

  it('部分代碼:給了任一顏色,九色全由宿主推出;只給字體不動顏色', () => {
    const colors = ['bg', 'surface', 'border', 'heading', 'text', 'muted', 'accent', 'on-accent', 'accent-2'];
    const declared = (css: string) => colors.filter((t) => css.includes(`--aw-${t}:`));
    const white = hostThemeCss(parseHostTheme({ 'aw-bg': '#ffffff' }));
    expect(declared(white)).toEqual(colors);
    expect(white).toContain('--aw-text:#1f2328');
    expect(hostThemeCss(parseHostTheme({ 'aw-bg': 'hsl(230 40% 8%)' }))).toContain('--aw-text:#f0f0f0');
    expect(declared(hostThemeCss(parseHostTheme({ 'aw-accent': 'rgb(49, 130, 206)' })))).toEqual(colors);
    expect(hostThemeCss(parseHostTheme({ 'aw-accent': '#f5d76e' }))).toContain('--aw-on-accent:#1f2328');
    // 半透明底色無從判斷對比:不收,改由推導
    expect(parseHostTheme({ 'aw-bg': 'rgba(0,0,0,0)' })).toEqual({});
    expect(parseHostTheme({ 'aw-bg': '#0000' })).toEqual({});
    expect(parseHostTheme({ 'aw-bg': 'rgb(0 0 0 / 100%)' })).toEqual({ bg: 'rgb(0 0 0 / 100%)' });
    const fontOnly = hostThemeCss(parseHostTheme({ 'aw-font': 'Inter', 'aw-radius': '4px' }));
    expect(declared(fontOnly)).toEqual([]);
    expect(fontOnly).not.toContain('--aw-backdrop');
  });

  it('輸出永遠不含跳脫字元(混合合格與不合格值)', () => {
    const css = hostThemeCss(
      parseHostTheme({ 'aw-bg': '#000', 'aw-text': '</style>', 'aw-font': 'A;B', 'aw-radius': '1rem' }),
    );
    expect(css).toContain('--aw-bg:#000;');
    expect(css).toContain('--aw-radius:1rem;');
    expect(css).not.toMatch(/<|>|\\|url\(|\/\*|--aw-font:/);
    expect(css).toContain('--aw-text:#f0f0f0;'); // 被拒的內文改由底色推出,不是原值
  });
});
