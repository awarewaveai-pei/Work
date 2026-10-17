import { notFound } from "next/navigation";
import RoutePage from "../../../(shell)/tools/social/RoutePage";

// the id goes into /api/social/posts/<id> as it is: only a post id may reach it (critic 2026-10-17)
const POST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "編輯貼文 · 社群發文" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!POST_ID.test(id)) notFound();
  return <RoutePage route={{ kind: "compose", postId: id }} />;
}
