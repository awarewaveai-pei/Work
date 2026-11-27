import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { TOOL_COMPONENTS, resolveToolRoute } from "@/components/toolRegistry";
import { PAGE_SLUGS } from "@/lib/site";
import { hostThemeCss, parseHostTheme } from "@/lib/theme/hostTheme";

/** 與獨立頁一樣在 build 時預生成;清單外的 slug 由框架直接 404。 */
export function generateStaticParams() {
  return PAGE_SLUGS.map((slug) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const route = resolveToolRoute(lang, slug);
  if (!route) return {};
  const dict = await getDictionary(route.locale);
  return { title: dict.nav[route.slug] };
}

/**
 * 嵌入版工具頁:只有工具本身。#aw-oracle-root 是外掛父頁腳本量高度的元素,id 不可改。
 * 宿主主題代碼(查詢字串 aw-*)在伺服端驗證後寫成一個 <style>,React 把它提到 <head>,首次繪製就是宿主的顏色;
 * 沒有代碼就不輸出(lib/theme/hostTheme.ts)。CSP style-src 已有 'unsafe-inline',不需改政策。
 */
export default async function EmbedToolPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang, slug } = await params;
  const route = resolveToolRoute(lang, slug);
  if (!route) notFound();
  const dict = await getDictionary(route.locale);
  const Tool = TOOL_COMPONENTS[route.slug];
  const themeCss = hostThemeCss(parseHostTheme(await searchParams));

  return (
    <main id="aw-oracle-root" className="relative px-4 py-6" style={{ display: "flow-root" }}>
      {themeCss ? (
        <style href="aw-host-theme" precedence="high">
          {themeCss}
        </style>
      ) : null}
      <div className="mx-auto max-w-4xl">
        <Tool dict={dict} locale={route.locale} />
      </div>
    </main>
  );
}
