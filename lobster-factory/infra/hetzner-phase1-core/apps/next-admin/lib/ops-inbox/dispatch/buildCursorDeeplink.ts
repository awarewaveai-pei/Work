import type { Incident } from "@/lib/ops-inbox/types";
import { buildIncidentPrompt } from "./buildPrompt";

const MAX_DEEPLINK_LEN = 7800;

export function buildCursorDeeplink(incident: Incident): string {
  let prompt = buildIncidentPrompt(incident, "cursor");
  let encoded = encodeURIComponent(prompt);

  if (encoded.length > MAX_DEEPLINK_LEN) {
    prompt = buildIncidentPrompt({ ...incident, raw: { _omitted: "see inbox detail page" } }, "cursor");
    encoded = encodeURIComponent(prompt);
  }

  if (encoded.length > MAX_DEEPLINK_LEN) {
    const truncated = { ...incident, raw: {}, message: `${(incident.message ?? "").slice(0, 2000)}...` };
    prompt = buildIncidentPrompt(truncated, "cursor");
    encoded = encodeURIComponent(prompt);
  }

  return `cursor://anysphere.cursor-deeplink/prompt?text=${encoded}`;
}
