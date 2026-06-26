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

const BRAND = 'ORACLE · 東西方命理';
const DOMAIN = 'oracle.aware-wave.com';

async function loadCjkFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700&text=${encodeURIComponent(
      text,
    )}`;
    const res = await fetch(api, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const css = await res.text();
    const m = css.match(/src:\s*url\(([^)]+)\)/);
    if (!m) return null;
    const fontRes = await fetch(m[1], { signal: AbortSignal.timeout(6000) });
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

function clamp(s: string | null, n: number): string {
  return (s ?? '').slice(0, n);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = clamp(searchParams.get('title'), 40) || '東西方命理';
  const subtitle = clamp(searchParams.get('subtitle'), 60);
  const lines = clamp(searchParams.get('lines'), 400)
    .split('|')
    .map((s) => `· ${s.slice(0, 40)}`)
    .filter((s) => s.length > 2)
    .slice(0, 6);
  const type = searchParams.get('type') ?? 'ziwei';
  const accent = ACCENTS[type] ?? '#d4b15f';

  // 字型子集只需「實際會渲染的字」;不含裝飾符號以免 Google Fonts 子集 400。
  const allText = BRAND + title + subtitle + lines.join('') + DOMAIN;
  const font = await loadCjkFont(allText);

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
          fontFamily: '"Noto Sans TC", sans-serif',
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
      fonts: font
        ? [{ name: 'Noto Sans TC', data: font, weight: 700, style: 'normal' }]
        : undefined,
    },
  );
}
