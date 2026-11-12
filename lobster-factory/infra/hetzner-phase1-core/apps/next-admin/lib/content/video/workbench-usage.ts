import type { Grant } from "@/lib/entitlements/can";
import { grantFor } from "@/lib/entitlements/grant";
import { reportForService } from "@/lib/entitlements/service-usage";

// video-workbench's paid actions (its backend/main-system.cjs paidFeature / PAID_ROUTES), each asked by its literal key:
// lib/portal/__tests__/registry-code.test.ts only sees literal asks, and requires each to reach recordUse.
const ASK: Readonly<Record<string, () => Promise<Grant>>> = {
  "video.script": () => grantFor("video.script"),
  "video.image": () => grantFor("video.image"),
  "video.motion": () => grantFor("video.motion"),
  "video.tts": () => grantFor("video.tts"),
  "video.transcribe": () => grantFor("video.transcribe"),
  "video.bg-remove": () => grantFor("video.bg-remove"),
  "video.3d": () => grantFor("video.3d"),
  "video.enhance": () => grantFor("video.enhance"),
};

/** One delivered workbench action -> charged to its billing account (POST /api/internal/video/workbench/usage). */
export const reportWorkbenchUsage = (input: unknown, opts?: Parameters<typeof reportForService>[3]) =>
  reportForService("video", input, (featureKey) => (Object.hasOwn(ASK, featureKey) ? ASK[featureKey] : null), opts);
