"use client";
// The one way this tool shows a video file as a still (post list, calendar card, media library, composer, analytics).
// A <video preload="metadata"> paints frame 0, and our videos open on black (2026-11-14: all six in 貼文清單 were black
// squares; at 1 s all six show a picture). So it asks for 1 s (#t=1), or the middle of a clip shorter than 2 s.
// A file that does not load shows the word 影片 instead of an empty box. With controls (the composer preview) the first
// play starts from 0, so the preview plays what the platform will.
import { useRef, useState, type SyntheticEvent } from "react";

export const FRAME_AT = 1;

/** The file's URL asking for the frame at FRAME_AT; an existing #fragment is the caller's choice and stays. */
export function frameUrl(src: string): string {
  return src.includes("#") ? src : `${src}#t=${FRAME_AT}`;
}

export default function VideoFrame({ src, className, controls = false }: { src: string; className?: string; controls?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const played = useRef(false);
  if (failed === src) return <span className={className} aria-label="影片">影片</span>;
  const short = (e: SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (Number.isFinite(v.duration) && v.duration > 0 && v.duration < FRAME_AT * 2) v.currentTime = v.duration / 2;
  };
  return <video className={className} src={frameUrl(src)} muted playsInline preload="metadata" controls={controls} aria-label="影片"
    onLoadedMetadata={short} onError={() => setFailed(src)}
    onPlay={controls ? (e) => { if (!played.current) { played.current = true; e.currentTarget.currentTime = 0; } } : undefined} />;
}

/** Card VD.7: the one still a list shows for an attachment -- a video's cover image when it has one (social_media
 *  cover_media_id, 0163), else a frame of the video (VideoFrame); an image as itself; no file = the word. */
export function MediaStill({ item, className }: { item: { kind: string; postiz_path: string | null; cover_path?: string | null }; className?: string }) {
  if (!item.postiz_path) return <span className={className}>{item.kind === "video" ? "影片" : "圖"}</span>;
  if (item.kind !== "video") return <img className={className} src={item.postiz_path} alt="" loading="lazy" />;
  return item.cover_path ? <img className={className} src={item.cover_path} alt="影片封面" loading="lazy" /> : <VideoFrame className={className} src={item.postiz_path} />;
}
