import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

/**
 * 首頁 hub(Server Component,SEO)— 列出所有命理系統,導向各自頁面。
 * 各系統頁為獨立路由 → 各自可被搜尋引擎收錄(多語 hreflang)。
 */
const SYSTEMS = [
  { id: "ziwei", descKey: "ziweiDesc" },
  { id: "bazi", descKey: "baziDesc" },
  { id: "iching", descKey: "ichingDesc" },
  { id: "tarot", descKey: "tarotDesc" },
  { id: "daily", descKey: "dailyDesc" },
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
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-slate-900">{dict.hub.title}</h1>
          <p className="mt-3 text-slate-500">{dict.hub.subtitle}</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SYSTEMS.map((s) => (
            <Link
              key={s.id}
              href={`/${lang}/${s.id}`}
              className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <h2 className="text-xl font-semibold text-slate-900 group-hover:text-indigo-700">
                {dict.nav[s.id]}
              </h2>
              <p className="mt-2 text-sm text-slate-500">{dict.hub[s.descKey]}</p>
              <span className="mt-4 inline-block text-sm font-medium text-indigo-600">
                {dict.hub.enter} →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
