/** Deterministic caption renditions from an immutable timed transcript. */

export interface TimedCaptionSegment {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

function assertSegments(segments: readonly TimedCaptionSegment[]): void {
  let previousEnd = 0;
  const ids = new Set<string>();
  for (const [index, segment] of segments.entries()) {
    if (!/^\S+$/.test(segment.id) || ids.has(segment.id)) throw new Error(`caption segment ${index} has invalid or duplicate id`);
    ids.add(segment.id);
    if (!Number.isInteger(segment.startMs) || !Number.isInteger(segment.endMs) || segment.startMs < 0 || segment.endMs <= segment.startMs) {
      throw new Error(`caption segment ${index} has invalid time range`);
    }
    if (segment.startMs < previousEnd) throw new Error(`caption segment ${index} overlaps the previous segment`);
    if (!segment.text.trim()) throw new Error(`caption segment ${index} has empty text`);
    previousEnd = segment.endMs;
  }
}

function timestamp(ms: number, decimalSeparator: "." | ","): string {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const millis = total % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${decimalSeparator}${String(millis).padStart(3, "0")}`;
}

export function toSrt(segments: readonly TimedCaptionSegment[]): string {
  assertSegments(segments);
  return segments.map((segment, index) => `${index + 1}\n${timestamp(segment.startMs, ",")} --> ${timestamp(segment.endMs, ",")}\n${segment.text.trim()}\n`).join("\n");
}

export function toVtt(segments: readonly TimedCaptionSegment[]): string {
  assertSegments(segments);
  return `WEBVTT\n\n${segments.map((segment) => `${segment.id}\n${timestamp(segment.startMs, ".")} --> ${timestamp(segment.endMs, ".")}\n${segment.text.trim()}\n`).join("\n")}`;
}
