import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

/**
 * 首頁 hub — 深色星空主題，5 個命理系統卡片。
 * Server Component：SEO + dict 解析在伺服器端。
 */

const SYSTEMS = [
  { id: "ziwei",  descKey: "ziweiDesc", glyph: "☽" },
  { id: "bazi",   descKey: "baziDesc",  glyph: "⊕" },
  { id: "iching", descKey: "ichingDesc",glyph: "☲" },
  { id: "tarot",  descKey: "tarotDesc", glyph: "✦" },
  { id: "astrology", descKey: "astrologyDesc", glyph: "♆" },
  { id: "daily",  descKey: "dailyDesc", glyph: "☀" },
] as const;

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
              fontFamily: "var(--font-noto-serif-tc), 'PingFang TC', serif",
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              fontWeight: 700,
              color: "var(--text-heading)",
              letterSpacing: "0.06em",
              textShadow: "0 0 40px rgba(168, 85, 247, 0.4)",
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
          {SYSTEMS.map((s) => (
            <Link
              key={s.id}
              href={`/${lang}/${s.id}`}
              className="glass-card block p-6 no-underline group"
            >
              <span className="system-glyph">{s.glyph}</span>
              <h2
                style={{
                  fontFamily: "var(--font-noto-serif-tc), 'PingFang TC', serif",
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "var(--text-heading)",
                  marginBottom: "0.5rem",
                  transition: "color var(--dur-normal) var(--ease-out)",
                }}
              >
                {dict.nav[s.id]}
              </h2>
              <p style={{ color: "var(--text-caption)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                {dict.hub[s.descKey]}
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
