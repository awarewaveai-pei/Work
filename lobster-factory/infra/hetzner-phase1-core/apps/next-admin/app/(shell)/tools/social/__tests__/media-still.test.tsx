// Card VD.7: a video with a cover shows the cover in every list (it opens on black, 2026-11-14); without one, the frame
// at 1 s as before; an image is itself.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaStill } from "../VideoFrame";

describe("MediaStill", () => {
  it("a video with a cover renders the cover image, not the video", () => {
    const html = renderToStaticMarkup(<MediaStill item={{ kind: "video", postiz_path: "https://cdn/v.mp4", cover_path: "https://cdn/c.jpg" }} />);
    expect(html).toMatch(/<img[^>]*src="https:\/\/cdn\/c.jpg"/);
    expect(html).not.toMatch(/<video/);
  });
  it("a video without a cover keeps the 1 s frame; an image stays an image; no file = the word", () => {
    expect(renderToStaticMarkup(<MediaStill item={{ kind: "video", postiz_path: "https://cdn/v.mp4", cover_path: null }} />)).toMatch(/<video[^>]*src="https:\/\/cdn\/v.mp4#t=1"/);
    expect(renderToStaticMarkup(<MediaStill item={{ kind: "image", postiz_path: "https://cdn/i.jpg", cover_path: "https://cdn/c.jpg" }} />)).toMatch(/<img[^>]*src="https:\/\/cdn\/i.jpg"/);
    expect(renderToStaticMarkup(<MediaStill item={{ kind: "video", postiz_path: null }} />)).toBe("<span>影片</span>");
  });
});
