import { TopicsBoard } from "../../(shell)/tools/content/topics/TopicsBoard";

export const metadata = { title: "題目" };

// content.<base domain>/topics, as staff open it at /tools/content/topics.
export default function ContentDoorTopicsPage() {
  return <TopicsBoard />;
}
