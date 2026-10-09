import { FacilitatePage } from "../../../../../components/blocks/FacilitatePage";

// FACILITATE 帶領 for one group: the script step by step, what participants chose to show, the log. A group is not a case;
// the API answers 404 to anyone not in it.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <FacilitatePage groupId={decodeURIComponent((await params).id)} />;
}
