import { DoorTopicsBoard } from "../DoorTopicsBoard";

export const metadata = { title: "五步驟" };

// content.<base domain>/topics/steps, as staff open it at /tools/content/topics/steps.
export default function ContentDoorTopicsStepsPage() {
  return <><h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>五步驟</h1><DoorTopicsBoard view="steps" /></>;
}
