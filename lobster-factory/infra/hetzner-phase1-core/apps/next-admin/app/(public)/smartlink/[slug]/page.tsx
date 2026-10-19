// The public smart link page (SOCIAL_MANAGER_PLAN.md C26): social.aware-wave.com/smartlink/<slug>, no login. A page that is
// not published, or does not exist, shows the same 「這頁還沒開放」 with status 404. Each button goes through
// ./go/<item> (counted there), so the page itself never carries the brand's urls or ids.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LinkPage from "../../../(shell)/tools/social/smartlinks/LinkPage";
import { publicPage } from "@/lib/social/smartlink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await publicPage((await params).slug);
  return page ? { title: page.title || "連結", description: page.bio || undefined } : { title: "這頁還沒開放", robots: { index: false } };
}

export default async function SmartLinkPublic({ params }: Params) {
  const { slug } = await params;
  const page = await publicPage(slug);
  if (!page) notFound();
  return (
    <main className="sl-screen">
      <LinkPage title={page.title} bio={page.bio} colour={page.colour}
        items={page.items.map((i) => ({ id: i.id, title: i.title, href: `/smartlink/${slug}/go/${i.id}` }))} />
    </main>
  );
}
