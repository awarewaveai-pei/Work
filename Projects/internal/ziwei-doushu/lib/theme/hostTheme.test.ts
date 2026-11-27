import { describe, expect, it } from 'vitest';
import { hostThemeCss, parseHostTheme } from './hostTheme';

const COLORS = ['palette1', 'palette2', 'palette3', 'palette4', 'palette5', 'palette6', 'palette7', 'palette8', 'palette9'];
const declared = (css: string) => COLORS.filter((t) => css.includes(`--global-${t}:`));

describe('宿主主題代碼 = Kadence 全域設定(安全邊界)', () => {
  it('合格值套用,變數名與 Kadence 相同', () => {
    const t = parseHostTheme({
      'aw-palette9': '#ffffff',
      'aw-palette4': 'rgb(26, 32, 44)',
      'aw-palette5': 'hsl(210deg 10% 40% / 0.9)',
      'aw-body-font': "'Noto Sans TC', Inter, sans-serif",
      'aw-button-radius': '6px',
    });
    expect(t).toEqual({
      palette9: '#ffffff',
      palette4: 'rgb(26, 32, 44)',
      palette5: 'hsl(210deg 10% 40% / 0.9)',
      'body-font': '"Noto Sans TC", "Inter", sans-serif',
      'button-radius': '6px',
    });
    const css = hostThemeCss(t);
    expect(css.startsWith(':root:root{--global-palette4:rgb(26, 32, 44);')).toBe(true);
    expect(css).toContain('--global-palette9:#ffffff;');
    expect(css).toContain('--global-body-font-family:"Noto Sans TC", "Inter", sans-serif, var(--font-geist-sans)');
    expect(css).toContain('--aw-button-radius:6px;');
  });

  it('不合格值退回預設(該項不輸出),沒有任何代碼就不輸出 <style>', () => {
    const t = parseHostTheme({
      'aw-palette9': 'red',
      'aw-palette1': '#12345',
      'aw-button-radius': '12',
      'aw-body-font': 'inherit',
      'aw-palette3': ['#fff', '#000'],
      'aw-unknown': '#fff',
    });
    expect(t).toEqual({});
    expect(hostThemeCss(t)).toBe('');
  });

  it.each([
    ['aw-palette9', '#fff;}body{display:none'],
    ['aw-palette9', 'rgb(1,2,3);color:red'],
    ['aw-palette8', 'url(https://evil.example/x.png)'],
    ['aw-palette4', '</style><script>alert(1)</script>'],
    ['aw-palette1', 'rgb(1,2,3)/**/'],
    ['aw-body-font', 'Inter;}*{x:y'],
    ['aw-body-font', 'Inter", url(x)'],
    ['aw-heading-font', 'x</style><script>alert(1)</script>'],
    ['aw-body-font', 'Inter\\3b'],
    ['aw-button-radius', '4px;}'],
    ['aw-button-radius', 'calc(1px + url(x))'],
  ])('拒絕可執行或跳脫的值 %s=%s', (key, value) => {
    const t = parseHostTheme({ [key]: value });
    expect(t).toEqual({});
    expect(hostThemeCss(t)).toBe('');
  });

  it('部分代碼:給了任一格顏色,九格全由宿主推出;只給字體不動顏色', () => {
    const white = hostThemeCss(parseHostTheme({ 'aw-palette9': '#ffffff' }));
    expect(declared(white)).toEqual(COLORS);
    expect(white).toContain('--global-palette4:#1f2328');
    expect(hostThemeCss(parseHostTheme({ 'aw-palette9': 'hsl(230 40% 8%)' }))).toContain('--global-palette4:#f0f0f0');
    expect(declared(hostThemeCss(parseHostTheme({ 'aw-palette1': 'rgb(49, 130, 206)' })))).toEqual(COLORS);
    // 半透明底色無從判斷對比:不收,改由推導
    expect(parseHostTheme({ 'aw-palette9': 'rgba(0,0,0,0)' })).toEqual({});
    expect(parseHostTheme({ 'aw-palette9': '#0000' })).toEqual({});
    expect(parseHostTheme({ 'aw-palette9': 'rgb(0 0 0 / 100%)' })).toEqual({ palette9: 'rgb(0 0 0 / 100%)' });
    const fontOnly = hostThemeCss(parseHostTheme({ 'aw-body-font': 'Inter', 'aw-button-radius': '4px' }));
    expect(declared(fontOnly)).toEqual([]);
    expect(fontOnly).not.toContain('--aw-backdrop');
  });

  it('輸出永遠不含跳脫字元(混合合格與不合格值)', () => {
    const css = hostThemeCss(
      parseHostTheme({ 'aw-palette9': '#000', 'aw-palette4': '</style>', 'aw-body-font': 'A;B', 'aw-button-radius': '1rem' }),
    );
    expect(css).toContain('--global-palette9:#000');
    expect(css).toContain('--aw-button-radius:1rem;');
    expect(css).not.toMatch(/<|>|\\|url\(|\/\*|--global-body-font-family:/);
    expect(css).toContain('--global-palette4:#f0f0f0;'); // 被拒的內文改由底色推出,不是原值
  });
});
