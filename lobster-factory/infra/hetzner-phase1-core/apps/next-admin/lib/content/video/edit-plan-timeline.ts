import { validateEditPlan } from "./edit-plan";
import {
  validateMediaTimelineV1,
  type MediaTimelineV1,
  type MediaTimelineV1OutputProfile,
} from "./timeline-v1";

export type EditPlanTimelineResult =
  | { readonly ok: true; readonly timeline: MediaTimelineV1 }
  | { readonly ok: false; readonly errors: readonly { readonly path: string; readonly message: string }[] };

const DEFAULT_PROFILES: readonly MediaTimelineV1OutputProfile[] = ["landscape_16_9"];

/**
 * Compile a validated real-footage Edit Decision Plan into the canonical
 * renderer-neutral Timeline. This is pure: tenant ownership and asset URL
 * resolution stay in the API boundary that calls it.
 */
export function compileEditPlanToTimeline(
  input: unknown,
  options: {
    readonly timelineId: string;
    readonly organizationId: string;
    readonly outputProfiles?: readonly MediaTimelineV1OutputProfile[];
  },
): EditPlanTimelineResult {
  const edp = validateEditPlan(input);
  if (!edp.ok) return { ok: false, errors: edp.findings.map((f) => ({ path: f.path, message: f.message })) };
  const value = input as Record<string, unknown>;
  const sources = value.sources as readonly Record<string, unknown>[];
  const decisions = value.decisions as readonly Record<string, unknown>[];
  const sourceIds = sources.map((source) => String(source.assetId));
  const firstSource = sourceIds[0];
  if (!firstSource) return { ok: false, errors: [{ path: "$.sources", message: "至少需要一個 source" }] };

  const videoItems = [...decisions]
    .sort((a, b) => Number(a.destinationStartMs) - Number(b.destinationStartMs))
    .map((decision, index) => ({
      id: `footage_${String(index + 1).padStart(4, "0")}`,
      startMs: Number(decision.destinationStartMs),
      durationMs: Number(decision.outMs) - Number(decision.inMs),
      sourceArtifactId: String(decision.sourceAssetId),
      sourceStartMs: Number(decision.inMs),
      crop: "cover" as const,
      transitionOut: "cut" as const,
      provenance: "footage" as const,
    }));
  const timeline = {
    schemaVersion: "1.0.0" as const,
    timelineId: options.timelineId,
    organizationId: options.organizationId,
    purpose: "footage_edit" as const,
    frameRate: Number(value.frameRate),
    outputProfiles: options.outputProfiles?.length ? [...options.outputProfiles] : [...DEFAULT_PROFILES],
    tracks: [{ id: "video_main", kind: "video" as const, items: videoItems }],
    // Timeline v1 currently models styleRef as a controlled artifact reference.
    // The first source is the neutral footage style anchor until style packs
    // become a first-class asset type.
    styleRef: firstSource,
    provenance: {
      capabilityVersions: { "media.edit_plan": "1.0.0", "media.timeline_plan": "1.0.0" },
      sourceArtifacts: sourceIds,
    },
  };
  const validation = validateMediaTimelineV1(timeline);
  if ("errors" in validation) return { ok: false, errors: validation.errors.map((e) => ({ path: e.path, message: e.message })) };
  return { ok: true, timeline: validation.value };
}
