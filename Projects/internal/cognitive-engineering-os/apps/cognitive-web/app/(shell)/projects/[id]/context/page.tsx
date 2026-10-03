import { ContextPage } from "../../../../../components/blocks/ContextPage";

// 規範與脈絡 for one case: the lens across MAP's six layers (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ContextPage projectId={decodeURIComponent((await params).id)} />;
}
