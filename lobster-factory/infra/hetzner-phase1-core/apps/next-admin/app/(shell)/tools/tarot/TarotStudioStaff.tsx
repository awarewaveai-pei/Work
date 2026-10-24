"use client";
// Staff-only (/tools/tarot): TarotStudio plus the AI edit-prompt panel, which asks studio.edit-prompt -- a studio feature
// the tarot door does not serve. The door page renders TarotStudio without this file (see TarotStaffApi).
import TarotStudio, { type TarotStaffApi } from "./TarotStudio";
import ImageEditPromptPanel from "@/components/tools/ImageEditPromptPanel";

const staff: TarotStaffApi = { EditPromptPanel: ImageEditPromptPanel };

export default function TarotStudioStaff() {
  return <TarotStudio staff={staff} />;
}
