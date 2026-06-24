import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import ZiweiTool from "@/components/ZiweiTool";

export default async function ZiweiPage({
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
