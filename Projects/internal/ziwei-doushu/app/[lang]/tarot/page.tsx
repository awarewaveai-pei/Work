import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import TarotTool from "@/components/TarotTool";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return { title: dict.tarot.title, description: dict.tarot.subtitle };
}

export default async function TarotPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <main className="relative flex-1 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 text-center">
          <span className="page-header-glyph">✦</span>
          <h1
            style={{
              fontFamily: "var(--font-noto-serif-tc), 'PingFang TC', serif",
              fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
              fontWeight: 700,
              color: "var(--text-heading)",
              letterSpacing: "0.04em",
              marginBottom: "0.5rem",
            }}
          >
            {dict.tarot.title}
          </h1>
          <p style={{ color: "var(--text-caption)", fontSize: "0.875rem", letterSpacing: "0.03em" }}>
            {dict.tarot.subtitle}
          </p>
          <div className="star-divider mx-auto mt-4" style={{ maxWidth: "200px" }} />
        </header>
        <TarotTool dict={dict} locale={lang} />
      </div>
    </main>
  );
}
