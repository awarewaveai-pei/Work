import { CollabPage } from "../../../../components/blocks/CollabPage";

// COLLAB 共同程序 for one group (a group is not a case); the API answers 404 to anyone not in it.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <CollabPage groupId={decodeURIComponent((await params).id)} />;
}
