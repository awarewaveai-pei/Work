import { TopicsPageContent } from "../../(shell)/tools/content/topics/TopicsPageContent";

export const metadata = { title: "題目" };
export const dynamic = "force-dynamic";

// content.<base domain>/topics, as staff open it at /tools/content/topics.
export default function ContentDoorTopicsPage() {
  return <TopicsPageContent />;
}
