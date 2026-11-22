import { isLocale, locales, type Locale } from '@/lib/i18n/config';
import { PAGE_SLUGS } from '@/lib/site';

/**
 * 站前面有 WordPress 時,舊的 /<語言>/<工具> 與 /<語言> 改由 WordPress 頁接手(ORACLE-WP-SPEC §2-3、§2-12)。
 * 來源只有執行期環境變數 ORACLE_FRONT_PAGES(JSON),未設定＝沒有 WordPress,引擎行為不變。格式見 deploy/DEPLOY.md:
 *
 *   {"pages":{"zh-TW":"/{slug}/","en":"/english/{slug}/"},"home":{"zh-TW":"/","en":"/english/"}}   (home 選填)
 *
 * 只產生同網域相對路徑:不收網域、協定、`//`。任何一處不合法＝整個視為未設定,記一行原因(不印值)。
 */

const SLUG = '{slug}';
/** 引擎佔用的第一段路徑(§2-1 分路):WordPress 頁不能落在這裡,否則轉向會轉回引擎自己。 */
const ENGINE_SEGMENTS: readonly string[] = [...locales, 'embed', 'api', '_next', 'tarot'];

export interface FrontPages {
  pages: Partial<Record<Locale, string>>;
  home: Partial<Record<Locale, string>>;
}

/** 一條最終路徑(`{slug}` 已換掉)是否會轉回引擎自己;回錯誤原因或 null。 */
function finalPathError(path: string): string | null {
  const segments = path.split('/');
  // `.`/`..` 段會被 URL 正規化成別的路徑,繞過下面的第一段檢查(`/x/../zh-TW/…` → `/zh-TW/…`,轉向迴圈)
  if (segments.some((s) => s === '.' || s === '..')) return 'must not contain . or .. segments';
  if (ENGINE_SEGMENTS.includes(segments[1])) return 'must not land on an engine path (zh-TW, en, embed, api, _next, tarot)';
  return null;
}

/**
 * 合法的同網域路徑樣式;回錯誤原因或 null。
 * 不變量:替換後的每一條最終路徑都不落在引擎佔用的前綴(否則轉回引擎 → 無限轉向)。
 *   所以逐一代入 PAGE_SLUGS 檢查,不只看樣式本身(`/{slug}/` 代入 tarot ＝ `/tarot/`,§2-1 歸引擎)。
 */
function pathError(path: unknown, withSlug: boolean): string | null {
  if (typeof path !== 'string') return 'must be a string';
  if (!path.startsWith('/')) return 'must start with /';
  // 只收可見 ASCII(排除空白與控制字元,Location 標頭用);`:` 擋協定,`?#` 擋查詢字串(轉向會接上原請求的查詢字串),
  // `%` 擋編碼過的點段與斜線(WordPress 固定網址用不到)
  if (/[^!-~]|\/\/|[:\\?#%]/.test(path)) return 'must not contain //, :, \\, ?, #, %, spaces or non-ASCII';
  const slugs = path.split(SLUG).length - 1;
  if (withSlug ? slugs !== 1 : slugs !== 0) return withSlug ? `must contain ${SLUG} once` : `must not contain ${SLUG}`;
  const finals = withSlug ? PAGE_SLUGS.map((slug) => path.replace(SLUG, slug)) : [path];
  for (const final of finals) {
    const why = finalPathError(final);
    if (why) return why;
  }
  return null;
}

function localeMap(raw: unknown, withSlug: boolean, name: string): { map: Partial<Record<Locale, string>>; error: string | null } {
  const map: Partial<Record<Locale, string>> = {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { map, error: `${name} must be an object` };
  for (const [key, value] of Object.entries(raw)) {
    if (!isLocale(key)) return { map, error: `${name}: unknown locale key` };
    const why = pathError(value, withSlug);
    if (why) return { map, error: `${name}.${key} ${why}` };
    map[key] = value as string;
  }
  return { map, error: null };
}

/** 解析 ORACLE_FRONT_PAGES;不合法時 config 為 null 並附原因(原因不含設定值)。 */
export function parseFrontPages(raw: string | undefined): { config: FrontPages | null; error: string | null } {
  if (!raw || !raw.trim()) return { config: null, error: null };
  const fail = (why: string) => ({ config: null, error: `ORACLE_FRONT_PAGES ignored: ${why}` });
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return fail('not JSON');
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return fail('must be a JSON object');
  const o = obj as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== 'pages' && k !== 'home')) return fail('only "pages" and "home" are allowed');
  const pages = localeMap(o.pages, true, 'pages');
  if (pages.error) return fail(pages.error);
  if (Object.keys(pages.map).length === 0) return fail('pages must name at least one locale');
  const home = o.home === undefined ? { map: {}, error: null } : localeMap(o.home, false, 'home');
  if (home.error) return fail(home.error);
  return { config: { pages: pages.map, home: home.map }, error: null };
}

let cache: { raw: string | undefined; config: FrontPages | null } | null = null;

/** 目前的設定;環境變數內容變了才重新解析(測試可傳 env)。 */
function getFrontPages(env: Record<string, string | undefined> = process.env): FrontPages | null {
  const raw = env.ORACLE_FRONT_PAGES;
  if (cache && cache.raw === raw) return cache.config;
  const { config, error } = parseFrontPages(raw);
  if (error) console.warn(error);
  cache = { raw, config };
  return config;
}

/** 有合法設定＝站前面有 WordPress(sitemap／robots 讓位)。 */
export function hasFrontPages(env?: Record<string, string | undefined>): boolean {
  return getFrontPages(env) !== null;
}

/** 該語言該工具的 WordPress 頁路徑;沒有對應回 null(照常顯示引擎頁)。 */
export function frontPageFor(locale: string, slug: string, env?: Record<string, string | undefined>): string | null {
  if (!isLocale(locale) || !(PAGE_SLUGS as readonly string[]).includes(slug)) return null;
  return getFrontPages(env)?.pages[locale]?.replace(SLUG, slug) ?? null;
}

/** 該語言首頁的 WordPress 頁路徑;沒有對應回 null。 */
export function frontHomeFor(locale: string, env?: Record<string, string | undefined>): string | null {
  if (!isLocale(locale)) return null;
  return getFrontPages(env)?.home[locale] ?? null;
}

/** proxy 用:`/<語言>`、`/<語言>/<工具>`(可帶結尾斜線)要轉去的 WordPress 路徑;其餘回 null。 */
export function frontRedirectFor(pathname: string, env?: Record<string, string | undefined>): string | null {
  const m = /^\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!m) return null;
  // 編碼過的語言碼／代稱(`/zh-TW/%7Aiwei`)解碼後再比,舊網址不留第二份可收錄的頁;解不開就不轉
  let locale: string, slug: string | undefined;
  try {
    locale = decodeURIComponent(m[1]);
    slug = m[2] === undefined ? undefined : decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  return slug === undefined ? frontHomeFor(locale, env) : frontPageFor(locale, slug, env);
}
