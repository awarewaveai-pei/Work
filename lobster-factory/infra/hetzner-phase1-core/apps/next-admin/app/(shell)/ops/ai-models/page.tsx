// The image model specs moved into a tab of /tools/ai-models (2026-10-23); old links land there.
import { redirect } from "next/navigation";

export default function AiModelsRedirect() {
  redirect("/tools/ai-models?tab=image-specs");
}
