import { DoorTopicsBoard } from "./DoorTopicsBoard";

export const metadata = { title: "題目" };

// content.<base domain>/topics, as staff open it at /tools/content/topics.
export default function ContentDoorTopicsPage() {
  return <><h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>題目</h1><DoorTopicsBoard view="topics" /></>;
}
