/**
 * 宿主主題代碼契約(嵌入頁 /embed/<語言>/<工具> 的外觀唯一來源;deploy/DEPLOY.md「宿主主題代碼」節)。
 * 代碼就是 Kadence 的全域設定:色盤九格(Kadence 前台的 --global-palette1…9)、內文字體、標題字體、按鈕圓角,
 * 嵌入頁 :root 設同名變數,引擎自己的變數都由這九格推出;「Kadence 的 palette3 是什麼色,工具裡的 palette3
 * 就是什麼色」。九格用途照 Kadence 慣例:1–2 強調、3–6 文字由深到淺、7–9 背景(DEPLOY.md 有對照表)。
 * 宿主(WordPress 外掛 includes/Embed/ThemeTokens.php)把代碼放在 iframe 網址查詢字串 `aw-<代碼>=<值>`;
 * 引擎在伺服端逐項驗證,合格的寫成 `:root` 自訂屬性,不合格或沒給的那項見 hostThemeCss()。
 * 安全邊界:值只能是資料。顏色只收 hex／rgb()／rgba()／hsl()／hsla(),字體只收字母數字空白與 - _ 的字族名
 * (引擎自己加引號),長度只收數字＋px/rem/em;所以輸出不可能含 ; { } < > \ url( 或註解。改這裡 = 改安全邊界,
 * 測試 lib/theme/hostTheme.test.ts 必須一起改。
 */

/** 契約代碼(順序 = 文件順序)。改名或增減 = 外掛 ThemeTokens::TOKENS 一起改。 */
export const THEME_TOKENS = [
  'palette1', // 強調:主要按鈕、重點數值
  'palette2', // 第二強調:焦點框、分隔線、次要按鈕
  'palette3', // 標題字
  'palette4', // 內文
  'palette5', // 次要字
  'palette6', // 最淡的字
  'palette7', // 邊框
  'palette8', // 卡片、命盤表面
  'palette9', // 底色;主要按鈕上的字
  'body-font', // 內文字體
  'heading-font', // 標題字體
  'button-radius', // 按鈕圓角(卡片 = 1×;小元件 2/3×;大元件 4/3×、5/3×)
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type HostTheme = Partial<Record<ThemeToken, string>>;

type Kind = 'color' | 'font' | 'length';
const KIND: Record<ThemeToken, Kind> = {
  palette1: 'color',
  palette2: 'color',
  palette3: 'color',
  palette4: 'color',
  palette5: 'color',
  palette6: 'color',
  palette7: 'color',
  palette8: 'color',
  palette9: 'color',
  'body-font': 'font',
  'heading-font': 'font',
  'button-radius': 'length',
};

/** 代碼 → :root 變數名;字體用 Kadence 的變數名,色盤 = --global-paletteN。 */
const VAR_NAME: Record<ThemeToken, string> = {
  palette1: '--global-palette1',
  palette2: '--global-palette2',
  palette3: '--global-palette3',
  palette4: '--global-palette4',
  palette5: '--global-palette5',
  palette6: '--global-palette6',
  palette7: '--global-palette7',
  palette8: '--global-palette8',
  palette9: '--global-palette9',
  'body-font': '--global-body-font-family',
  'heading-font': '--global-heading-font-family',
  'button-radius': '--aw-button-radius',
};

/** 查詢字串鍵的前綴:`aw-palette1`、`aw-heading-font`… */
export const QUERY_PREFIX = 'aw-';

const MAX_LEN = 120;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NUM = String.raw`-?(?:\d{1,3}(?:\.\d{1,4})?|\.\d{1,4})`;
const COMP = String.raw`${NUM}(?:%|deg)?`;
/** rgb(1, 2, 3) / rgba(1,2,3,.5) / rgb(1 2 3 / 50%) / hsl(210deg 40% 50%) … 只有數字、%、deg、逗號、斜線、空白。 */
const FUNC = new RegExp(
  String.raw`^(?:rgba?|hsla?)\(\s*${COMP}(?:\s*,\s*${COMP}){2}(?:\s*,\s*${COMP})?\s*\)$|` +
    String.raw`^(?:rgba?|hsla?)\(\s*${COMP}(?:\s+${COMP}){2}(?:\s*\/\s*${COMP})?\s*\)$`,
  'i',
);
const LENGTH = /^(?:0|\d{1,3}(?:\.\d{1,2})?(?:px|rem|em))$/;
const FAMILY = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,63}$/u;
const GENERIC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
]);
/** CSS 全域關鍵字不是字族;Kadence 標題字體的 inherit 由外掛換成內文字體。 */
const RESERVED = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer', 'default']);

export function validColor(value: string): string | null {
  const v = value.trim();
  if (v.length === 0 || v.length > MAX_LEN) return null;
  return HEX.test(v) || FUNC.test(v) ? v.replace(/\s+/g, ' ') : null;
}

export function validLength(value: string): string | null {
  const v = value.trim();
  return LENGTH.test(v) ? v : null;
}

/** "Inter", 'Noto Sans TC', sans-serif → `"Inter", "Noto Sans TC", sans-serif`;任何一個字族不合格 = 整項不收。 */
export function validFont(value: string): string | null {
  const v = value.trim();
  if (v.length === 0 || v.length > MAX_LEN) return null;
  const parts = v.split(',');
  if (parts.length > 4) return null;
  const out: string[] = [];
  for (const raw of parts) {
    let f = raw.trim();
    const q = f[0];
    if ((q === '"' || q === "'") && f.length >= 2 && f[f.length - 1] === q) f = f.slice(1, -1).trim();
    if (!FAMILY.test(f)) return null;
    const lower = f.toLowerCase();
    if (RESERVED.has(lower)) return null;
    out.push(GENERIC.has(lower) ? lower : `"${f}"`);
  }
  return out.join(', ');
}

/** 不透明:hex 無 alpha 或 alpha = f/ff;函式第四個分量(或 / 後)為 1 或 100%。 */
function opaque(color: string): boolean {
  const hex = /^#([0-9a-f]+)$/i.exec(color);
  if (hex) {
    const h = hex[1];
    return h.length === 3 || h.length === 6 || /^f+$/i.test(h.length === 4 ? h.slice(3) : h.slice(6));
  }
  const parts = color.replace(/^[a-z]+\(|\)$/gi, '').split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 4) return true;
  const a = parts[3];
  return a.endsWith('%') ? parseFloat(a) >= 100 : parseFloat(a) >= 1;
}

const VALIDATE: Record<Kind, (v: string) => string | null> = {
  color: validColor,
  font: validFont,
  length: validLength,
};

/** 查詢字串 → 驗證過的代碼。重複鍵(陣列)不收;未知鍵忽略。 */
export function parseHostTheme(params: Record<string, string | string[] | undefined>): HostTheme {
  const out: HostTheme = {};
  for (const token of THEME_TOKENS) {
    const raw = params[QUERY_PREFIX + token];
    if (typeof raw !== 'string') continue;
    const ok = VALIDATE[KIND[token]](raw);
    // 底色(第 9 格)決定整套墨色(deriveColors),半透明底的實際顏色取決於框外,無從判斷對比:不收。
    if (ok !== null && !(token === 'palette9' && !opaque(ok))) out[token] = ok;
  }
  return out;
}

/**
 * 有宿主主題時才套的衍生規則(固定字串,不含宿主值)。獨立站的裝飾(宇宙背景、星點、光暈、深紫宮位底)
 * 無法由代碼逐像素推出,app/globals.css 保留其預設;這裡把它們全部改由代碼推出或關掉,
 * 所以有宿主時畫面上沒有任何一個顏色不是從代碼來的(語意色 宜/忌/科/權 往標題色混,深淺底都可讀)。
 * 選擇器 :root:root 比 globals.css 的 :root 高一級,不依賴 <style> 與樣式表的先後。
 */
const HOSTED_RULES = [
  '--aw-backdrop:none',
  '--aw-stars:none',
  '--glass-bg:color-mix(in srgb,var(--global-palette8) 80%,transparent)',
  '--glass-bg-hover:var(--global-palette8)',
  '--glass-border-hover:var(--global-palette1)',
  '--violet-400:color-mix(in srgb,var(--global-palette2) 70%,var(--global-palette3))',
  '--violet-600:var(--global-palette2)',
  '--gold-500:var(--global-palette1)',
  '--violet-glow:transparent',
  '--gold-glow:transparent',
  '--gold-glow-strong:transparent',
  '--jade-400:color-mix(in srgb,#6ee7b7 45%,var(--global-palette3))',
  '--rose-400:color-mix(in srgb,#fb7185 45%,var(--global-palette3))',
  '--sky-400:color-mix(in srgb,#7dd3fc 45%,var(--global-palette3))',
  '--amber-400:color-mix(in srgb,#fbbf24 45%,var(--global-palette3))',
  '--jade-bg:color-mix(in srgb,var(--jade-400) 8%,transparent)',
  '--jade-border:color-mix(in srgb,var(--jade-400) 25%,transparent)',
  '--rose-bg:color-mix(in srgb,var(--rose-400) 8%,transparent)',
  '--rose-border:color-mix(in srgb,var(--rose-400) 25%,transparent)',
  '--shadow-ink:color-mix(in srgb,var(--global-palette3) 30%,transparent)',
  '--btn-primary-bg:var(--global-palette1)',
  '--btn-primary-bg-hover:color-mix(in srgb,var(--global-palette1) 85%,var(--global-palette3))',
  '--btn-primary-border:var(--global-palette1)',
  '--btn-primary-fg:var(--global-palette9)',
  '--btn-secondary-bg:transparent',
  '--btn-secondary-bg-hover:color-mix(in srgb,var(--global-palette2) 12%,transparent)',
  '--palace-bg:var(--global-palette9)',
  '--palace-bg-hover:color-mix(in srgb,var(--global-palette8) 88%,var(--global-palette2))',
  '--palace-center-bg:var(--global-palette8)',
  '--picker-filter:none',
  '--divider:linear-gradient(to right,transparent,color-mix(in srgb,var(--global-palette2) 40%,transparent),color-mix(in srgb,var(--global-palette1) 40%,transparent),transparent)',
].join(';');

/** 字體代碼後面接引擎預設字族:宿主字型在框內沒載入時退回引擎字型,不直接掉到系統字。 */
const FONT_TAIL: Partial<Record<ThemeToken, string>> = {
  'body-font': 'var(--font-geist-sans)',
  'heading-font': 'var(--font-noto-serif-tc)',
};

const COLOR_TOKENS: readonly ThemeToken[] = THEME_TOKENS.filter((t) => KIND[t] === 'color');
const DARK_INK = '#1f2328';
const LIGHT_INK = '#f0f0f0';

/** 已驗證顏色的相對亮度(WCAG);解析不了回 null。 */
export function luminance(color: string): number | null {
  let rgb: number[] | null = null;
  const hex = /^#([0-9a-f]+)$/i.exec(color);
  if (hex) {
    const h = hex[1].length <= 4 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    const m = /^(rgba?|hsla?)\((.*)\)$/i.exec(color);
    if (!m) return null;
    const parts = m[2].split(/[\s,/]+/).filter(Boolean);
    const num = (s: string, pctScale: number) => (s.endsWith('%') ? (parseFloat(s) * pctScale) / 100 : parseFloat(s));
    if (m[1].toLowerCase().startsWith('rgb')) {
      rgb = parts.slice(0, 3).map((p) => num(p, 255));
    } else {
      const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360;
      const s = num(parts[1], 1) > 1 ? num(parts[1], 1) / 100 : num(parts[1], 1);
      const l = num(parts[2], 1) > 1 ? num(parts[2], 1) / 100 : num(parts[2], 1);
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const ch = (t: number) => {
        const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
        return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
      };
      rgb = [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)].map((v) => v * 255);
    }
  }
  if (rgb.some((v) => !Number.isFinite(v))) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = Math.min(255, Math.max(0, v)) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 在 color 上對比較高的墨色(深或淺)。 */
function inkOn(color: string): string {
  const l = luminance(color) ?? 0;
  return (l + 0.05) / (luminance(DARK_INK)! + 0.05) >= (luminance(LIGHT_INK)! + 0.05) / (l + 0.05) ? DARK_INK : LIGHT_INK;
}

/**
 * 不變量:宿主給了任一格顏色,九格就全部由宿主的值推出,絕不混用紫金預設
 * (例:只給白底卻沿用預設淺紫內文 = 白底淺字)。底色(9)與內文(4)缺項以亮度挑深／淺墨色,其餘由兩者混出。
 * 只給字體／圓角 = 只換字體／圓角,顏色與裝飾維持獨立站。
 */
function deriveColors(theme: HostTheme): Partial<Record<ThemeToken, string>> {
  const out: Partial<Record<ThemeToken, string>> = {};
  let bg = theme.palette9;
  let text = theme.palette4 ?? theme.palette3;
  if (bg === undefined) bg = text !== undefined ? inkOn(text) : inkOn(theme.palette1 ?? theme.palette2 ?? DARK_INK);
  if (text === undefined) text = inkOn(bg);
  const mix = (a: string, pct: number, b: string) => `color-mix(in srgb,var(${a}) ${pct}%,${b})`;
  const derived: Record<ThemeToken, string | undefined> = {
    palette9: bg,
    palette4: text,
    palette3: 'var(--global-palette4)',
    palette5: mix('--global-palette4', 70, 'var(--global-palette9)'),
    palette6: mix('--global-palette4', 55, 'var(--global-palette9)'),
    palette7: mix('--global-palette4', 18, 'var(--global-palette9)'),
    palette8: mix('--global-palette9', 94, 'var(--global-palette4)'),
    palette1: theme.palette2 !== undefined ? 'var(--global-palette2)' : 'var(--global-palette3)',
    palette2: 'var(--global-palette1)',
    'body-font': undefined,
    'heading-font': undefined,
    'button-radius': undefined,
  };
  for (const t of COLOR_TOKENS) if (theme[t] === undefined) out[t] = derived[t];
  return out;
}

/** 驗證過的代碼 → <style> 內容;沒有任何代碼回 ''(不輸出 <style>,維持獨立站外觀)。 */
export function hostThemeCss(theme: HostTheme): string {
  const decls: string[] = [];
  for (const token of THEME_TOKENS) {
    const v = theme[token];
    if (v === undefined) continue;
    const tail = FONT_TAIL[token];
    decls.push(`${VAR_NAME[token]}:${tail ? `${v}, ${tail}` : v}`);
  }
  if (decls.length === 0) return '';
  if (!COLOR_TOKENS.some((t) => theme[t] !== undefined)) return `:root:root{${decls.join(';')}}`;
  for (const [token, expr] of Object.entries(deriveColors(theme))) decls.push(`${VAR_NAME[token as ThemeToken]}:${expr}`);
  return `:root:root{${decls.join(';')};${HOSTED_RULES}}`;
}
