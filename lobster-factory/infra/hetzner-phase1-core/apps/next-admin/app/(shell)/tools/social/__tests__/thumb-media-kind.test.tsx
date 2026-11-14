// P6.10 defect C (2026-11-13): the three video drafts showed broken thumbnails in the post list -- Thumb put every
// attachment's postiz_path into <img>, video files included. The thumbnail follows the attachment's kind.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Thumb } from "../Calendar";
import type { Post } from "../model";
import type { MediaItem } from "../api";

const post = (mediaId: string) => ({
  id: "p1", state: "draft", body: "x", scheduled_at: null, list_id: null, list_position: null, first_comment: null, link_url: null,
  link_utm: false, notes: null, source_url: null, published_at: null, deleted_at: null, version: 1, repeat: null, repeat_of: null,
  origin_slot: null, auto_mode: "brand", targets: [], media: [{ media_id: mediaId, position: 0, alt_text: null }], comments: [], tags: [],
}) as unknown as Post;
const item = (id: string, kind: string): MediaItem => ({ id, kind, file_name: "f", postiz_path: `https://cdn.example/${id}`, bytes: 1, created_at: "2026-11-13" });

describe("Thumb -- by attachment kind", () => {
  it("a video attachment renders a <video>, never an <img>", () => {
    const html = renderToStaticMarkup(<Thumb post={post("v1")} accounts={[]} media={[item("v1", "video")]} />);
    expect(html).toMatch(/<video[^>]*src="https:\/\/cdn.example\/v1#t=1"/);   // 2026-11-14: frame 0 of our videos is black
    expect(html).toMatch(/preload="metadata"/);
    expect(html).not.toMatch(/<img/);
  });
  it("an image attachment still renders an <img>", () => {
    const html = renderToStaticMarkup(<Thumb post={post("i1")} accounts={[]} media={[item("i1", "image")]} />);
    expect(html).toMatch(/<img[^>]*src="https:\/\/cdn.example\/i1"/);
    expect(html).not.toMatch(/<video/);
  });
});
