import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { PAGE_SLUGS, type PageSlug } from "@/lib/site";

/**
 * 首頁 hub — 深色星空主題，5 個命理系統卡片。
 * Server Component：SEO + dict 解析在伺服器端。
 */

/** 每頁卡片圖示;順序由 PAGE_SLUGS 決定。漏一頁、或 messages 缺 hub.<slug>Desc,tsc 紅。 */
const GLYPHS: Record<PageSlug, string> = {
  ziwei: "☽",
  bazi: "⊕",
  hehun: "☯",
  iching: "☲",
  tarot: "✦",
  qian: "☸",
  astrology: "♆",
  vedic: "✺",
  fengshui: "☷",
  qimen: "☰",
  zeri: "☑",
  daily: "☀",
};
const descKey = (id: PageSlug) => `${id}Desc` as const;

export default async function Hub({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <main className="relative flex-1 px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl">

        {/* Hero */}
        <header className="mb-14 text-center">
          <span className="page-header-glyph">✦</span>
          <h1
            style={{
              fontFamily: "var(--font-heading), 'PingFang TC', serif",
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              fontWeight: 700,
              color: "var(--text-heading)",
              letterSpacing: "0.06em",
              textShadow: "0 0 40px color-mix(in srgb, var(--global-palette2) 40%, transparent)",
              lineHeight: 1.2,
              marginBottom: "0.75rem",
            }}
          >
            {dict.hub.title}
          </h1>
          <p
            style={{
              color: "var(--text-body)",
              fontSize: "0.9375rem",
              letterSpacing: "0.05em",
            }}
          >
            {dict.hub.subtitle}
          </p>
          {/* Decorative divider */}
          <div className="star-divider mx-auto mt-6" style={{ maxWidth: "280px" }} />
        </header>

        {/* System cards */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PAGE_SLUGS.map((id) => (
            <Link
              key={id}
              href={`/${lang}/${id}`}
              className="glass-card block p-6 no-underline group"
            >
              <span className="system-glyph">{GLYPHS[id]}</span>
              <h2
                style={{
                  fontFamily: "var(--font-heading), 'PingFang TC', serif",
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "var(--text-heading)",
                  marginBottom: "0.5rem",
                  transition: "color var(--dur-normal) var(--ease-out)",
                }}
              >
                {dict.nav[id]}
              </h2>
              <p style={{ color: "var(--text-caption)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                {dict.hub[descKey(id)]}
              </p>
              <span
                className="mt-4 inline-block text-sm font-semibold"
                style={{ color: "var(--gold-400)", textShadow: "0 0 10px var(--gold-glow)" }}
              >
                {dict.hub.enter} →
              </span>
            </Link>
          ))}
        </div>

      </div>
    </main>
  );
}
