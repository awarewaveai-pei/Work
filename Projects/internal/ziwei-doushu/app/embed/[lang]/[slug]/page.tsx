import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { TOOL_COMPONENTS, resolveToolRoute } from "@/components/toolRegistry";
import { PAGE_SLUGS } from "@/lib/site";

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

/** 嵌入版工具頁:只有工具本身。#aw-oracle-root 是外掛父頁腳本量高度的元素,id 不可改。 */
export default async function EmbedToolPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const route = resolveToolRoute(lang, slug);
  if (!route) notFound();
  const dict = await getDictionary(route.locale);
  const Tool = TOOL_COMPONENTS[route.slug];

  return (
    <main id="aw-oracle-root" className="relative px-4 py-6" style={{ display: "flow-root" }}>
      <div className="mx-auto max-w-4xl">
        <Tool dict={dict} locale={route.locale} />
      </div>
    </main>
  );
}
