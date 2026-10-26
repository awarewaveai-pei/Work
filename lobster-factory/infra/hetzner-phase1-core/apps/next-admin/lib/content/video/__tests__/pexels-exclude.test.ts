import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBrollUrl, fetchBrollVideoUrl } from "../pexels";

const photo = (n: string) => ({ src: { large2x: `https://images.pexels.com/${n}.jpg`, large: `https://images.pexels.com/${n}-s.jpg`, original: "" } });
const photoUrl = (n: string) => `https://images.pexels.com/${n}.jpg`;
const video = (n: string) => ({ video_files: [{ quality: "hd", file_type: "video/mp4", width: 1920, height: 1080, link: `https://videos.pexels.com/${n}.mp4` }] });
const videoUrl = (n: string) => `https://videos.pexels.com/${n}.mp4`;
const names = ["A", "B", "C", "D", "E"];

function mockFetch(body: unknown) {
  const fn = vi.fn(async () => ({ ok: true, json: async () => body }) as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}
const calledUrl = (fn: ReturnType<typeof mockFetch>) => String((fn.mock.calls[0] as unknown[])[0]);

afterEach(() => vi.unstubAllGlobals());

describe("fetchBrollUrl exclude", () => {
  const body = { photos: names.map(photo) };

  it("no exclude: first result, per_page=5", async () => {
    const fn = mockFetch(body);
    expect(await fetchBrollUrl("k", "key")).toBe(photoUrl("A"));
    expect(calledUrl(fn)).toContain("per_page=5");
  });

  it("exclude=[A]: not A, one of B-E, per_page=15", async () => {
    const fn = mockFetch(body);
    const got = await fetchBrollUrl("k", "key", undefined, "landscape", [photoUrl("A")]);
    expect(["B", "C", "D", "E"].map(photoUrl)).toContain(got);
    expect(calledUrl(fn)).toContain("per_page=15");
  });

  it("exclude=[A,B,C,D]: E", async () => {
    mockFetch(body);
    expect(await fetchBrollUrl("k", "key", undefined, "landscape", ["A", "B", "C", "D"].map(photoUrl))).toBe(photoUrl("E"));
  });
});

describe("fetchBrollVideoUrl exclude", () => {
  const body = { videos: names.map(video) };

  it("no exclude: first result, per_page=5", async () => {
    const fn = mockFetch(body);
    expect(await fetchBrollVideoUrl("k", "key")).toBe(videoUrl("A"));
    expect(calledUrl(fn)).toContain("per_page=5");
  });

  it("exclude=[A]: not A, one of B-E, per_page=15", async () => {
    const fn = mockFetch(body);
    const got = await fetchBrollVideoUrl("k", "key", undefined, "landscape", [videoUrl("A")]);
    expect(["B", "C", "D", "E"].map(videoUrl)).toContain(got);
    expect(calledUrl(fn)).toContain("per_page=15");
  });
});
