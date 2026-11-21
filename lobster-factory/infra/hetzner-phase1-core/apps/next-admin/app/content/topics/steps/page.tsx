import { DoorTopicsBoard } from "../DoorTopicsBoard";

export const metadata = { title: "五步驟" };

// content.<base domain>/topics/steps, as staff open it at /tools/content/topics/steps.
export default function ContentDoorTopicsStepsPage() {
  return <DoorTopicsBoard view="steps" />;
}
