import { describe, expect, it } from "vitest";
import { toSrt, toVtt } from "../caption-formats";

const segments = [
  { id: "seg_001", startMs: 0, endMs: 1250, text: "第一句" },
  { id: "seg_002", startMs: 1500, endMs: 3200, text: "第二句" },
] as const;

describe("caption formats", () => {
  it("renders deterministic SRT timestamps", () => {
    expect(toSrt(segments)).toBe("1\n00:00:00,000 --> 00:00:01,250\n第一句\n\n2\n00:00:01,500 --> 00:00:03,200\n第二句\n");
  });

  it("renders WEBVTT with stable cue IDs", () => {
    expect(toVtt(segments)).toBe("WEBVTT\n\nseg_001\n00:00:00.000 --> 00:00:01.250\n第一句\n\nseg_002\n00:00:01.500 --> 00:00:03.200\n第二句\n");
  });

  it("fails closed on overlap or empty text", () => {
    expect(() => toSrt([{ id: "a", startMs: 0, endMs: 1000, text: "a" }, { id: "b", startMs: 900, endMs: 1200, text: "b" }])).toThrow("overlaps");
    expect(() => toVtt([{ id: "a", startMs: 0, endMs: 1000, text: "   " }])).toThrow("empty text");
  });

  it("rejects duplicate or multiline cue IDs", () => {
    expect(() => toVtt([{ id: "same", startMs: 0, endMs: 1000, text: "a" }, { id: "same", startMs: 1000, endMs: 2000, text: "b" }])).toThrow("invalid or duplicate id");
    expect(() => toVtt([{ id: "bad\nid", startMs: 0, endMs: 1000, text: "a" }])).toThrow("invalid or duplicate id");
  });
});
