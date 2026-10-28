import { DoorTopicsBoard } from "./DoorTopicsBoard";

export const metadata = { title: "題目" };

// content.<base domain>/topics, as staff open it at /tools/content/topics.
export default function ContentDoorTopicsPage() {
  return <DoorTopicsBoard />;
}
