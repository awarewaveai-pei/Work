import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * 動態分享圖卡 (OG card) — Satori/ImageResponse。
 *
 * CJK:next/og 內建字型僅含拉丁(Geist),中文會變豆腐方塊。標準解法 = 依「卡片
 *   實際文字」向 Google Fonts 取最小子集字型(只含用到的字 → 體積小、快),
 *   render 時嵌入。取字型失敗(逾時/400/無網)則退回內建字型,降級為方塊但不崩潰。
 *
 * ⚠️ Satori 規則:任何 >1 child node 的元素必須顯式 display:flex。故所有文字節點
 *   皆組成單一字串(避免「字面文字 + {expr}」變兩個 child 觸發 render 例外)。
 */
export const dynamic = 'force-dynamic';

const ACCENTS: Record<string, string> = {
  ziwei: '#d4b15f',
  bazi: '#d4b15f',
  daily: '#7dd3c0',
  tarot: '#a78bfa',
  iching: '#6ee7b7',
  astrology: '#60a5fa',
};

const BRAND = 'ORACLE 東西方命理';
const DOMAIN = 'oracle.aware-wave.com';
const MIDDOT = '・'; // ・ 片假名中點(CJK 字型涵蓋);U+00B7「·」不在 Noto Sans TC

/** 把 U+00B7 中點換成 CJK 字型有涵蓋的中點,避免 Satori 逐字 fallback 取字型失敗。 */
function cjkSafe(s: string): string {
  return s.replace(/·/g, MIDDOT);
}

async function loadCjkFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700&text=${encodeURIComponent(
      text,
    )}`;
    // 用舊版 IE UA:Google Fonts 對其回 woff(Satori 可解),對現代 UA 回 woff2
    //   (此 @vercel/og 解不了 → 中文變方塊)。實測 2026-06-26。
    const res = await fetch(api, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const css = await res.text();
    const m = css.match(/src:\s*url\(([^)]+)\)/);
    if (!m) return null;
    // 明確白名單字型主機:Google CSS 不會把 text 反射進 src url(已驗無 SSRF),
    //   但把「信任 Google 格式」固化成顯式不變量,防未來格式變動/MITM(critic 2026-06-26)。
    const fontUrl = new URL(m[1]);
    if (fontUrl.protocol !== 'https:' || fontUrl.hostname !== 'fonts.gstatic.com')
      return null;
    const fontRes = await fetch(fontUrl, { signal: AbortSignal.timeout(6000) });
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

function clamp(s: string | null, n: number): string {
  return (s ?? '').slice(0, n);
}

/**
 * 載入內建拉丁字型(Geist)當 Latin fallback。
 * Noto Sans TC 的 text= 子集不含拉丁,故 ORACLE / 網域等拉丁字無字型 → @vercel/og
 *   會逐字 fetch fallback 並 400(雖仍出圖但拉丁變方塊)。提供 Geist 後全字解析。
 */
function loadLatinFont(): ArrayBuffer | null {
  try {
    const p = join(
      process.cwd(),
      'node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf',
    );
    const buf = readFileSync(p);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = cjkSafe(clamp(searchParams.get('title'), 40)) || '東西方命理';
  const subtitle = cjkSafe(clamp(searchParams.get('subtitle'), 60));
  const lines = clamp(searchParams.get('lines'), 400)
    .split('|')
    .map((s) => `${MIDDOT}${cjkSafe(s.slice(0, 40))}`)
    .filter((s) => s.length > 1)
    .slice(0, 6);
  const type = searchParams.get('type') ?? 'ziwei';
  const accent = ACCENTS[type] ?? '#d4b15f';

  // 字型子集只需「實際會渲染的字」;以正規化後文字請求,確保涵蓋(無 U+00B7)。
  const allText = BRAND + title + subtitle + lines.join('') + DOMAIN;
  const cjk = await loadCjkFont(allText);
  const latin = loadLatinFont();
  const fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[] =
    [];
  if (cjk) fonts.push({ name: 'Noto Sans TC', data: cjk, weight: 700, style: 'normal' });
  if (latin) fonts.push({ name: 'Geist', data: latin, weight: 400, style: 'normal' });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          background:
            'linear-gradient(135deg, #0b1020 0%, #1a1535 60%, #241a40 100%)',
          color: '#e8e6f0',
          padding: '90px',
          fontFamily: '"Noto Sans TC", "Geist", sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 34, color: accent, letterSpacing: 4 }}>
          {BRAND}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 76,
            fontWeight: 700,
            marginTop: 28,
            color: '#f5f3ff',
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ display: 'flex', fontSize: 34, marginTop: 18, color: '#b8b4d0' }}>
            {subtitle}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 44,
            gap: 14,
          }}
        >
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', fontSize: 32, color: '#d8d4ec' }}>
              {l}
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 56,
            right: 90,
            fontSize: 26,
            color: '#7a7595',
          }}
        >
          {DOMAIN}
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: fonts.length ? fonts : undefined,
    },
  );
}
