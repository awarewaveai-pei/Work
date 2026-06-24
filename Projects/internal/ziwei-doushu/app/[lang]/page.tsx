import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import ZiweiTool from "@/components/ZiweiTool";

/**
 * 首頁 (Server Component)。
 * SEO 外框 (h1/描述) 在 server 端渲染 → 可被搜尋引擎收錄;
 * 互動排盤工具 (表單 + 命盤) 是 client island (見 ZiweiTool)。
 */
export default async function Home({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">{dict.home.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{dict.home.subtitle}</p>
        </header>

        <ZiweiTool dict={dict} locale={lang} />
      </div>
    </main>
  );
}
