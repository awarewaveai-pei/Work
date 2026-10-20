"use client";
// 預覽 (mock .prev / shell()): one card per channel in that platform's order of things -- picture, name and handle,
// the text as the sender composes it (lib/social/compose.ts composeText via draft.ts) with what is past the limit
// marked, the images, then the comments under the post. No made-up counts.
import { BODY_LIMITS } from "@/lib/social/limits";
import { PfMark } from "../Calendar";
import { formatsOf, type Account } from "../model";
import { delayText, type CommentDraft } from "./draft";

const graphemes = (s: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].map((x) => x.segment);

function Text({ text, platform }: { text: string; platform: string }) {
  const max = BODY_LIMITS[platform];
  if (!text) return <span className="sm-muted">（文字會出現在這裡）</span>;
  if (!max || platform === "threads") return <>{text}</>;   // Threads counts bytes: the counter above says it
  const g = graphemes(text);
  if (g.length <= max) return <>{text}</>;
  return <>{g.slice(0, max).join("")}<mark className="sm-overmark" title={`超過 ${max} 字，這段發不出去`}>{g.slice(max).join("")}</mark></>;
}

export default function Previews({ channels, tab, textFor, formats, images, mediaKinds, comments, mediaPath, commentImage, when }: {
  channels: Account[]; tab: string; textFor: (a: Account) => string; formats: Record<string, string>;
  images: string[]; mediaKinds?: string[]; comments: CommentDraft[]; mediaPath: (id: string) => string | null;
  /** the platform posts a comment's image (lib/social/compose.ts commentTakesMedia) */
  commentImage: (platform: string) => boolean; when: string;
}) {
  const shown = tab === "all" ? channels : channels.filter((a) => a.id === tab);
  const parts = comments.filter((c) => c.body.trim() || c.media_id);
  return (
    <div className="sm-cprev" aria-label="預覽">
      <div className="sm-phd"><b>預覽</b>{shown.length > 1 && <span className="sm-muted">{shown.length} 個頻道，往下看</span>}</div>
      <div className="sm-screen">
        {!shown.length && <span className="sm-muted">先在左邊勾選要發到哪些頻道。</span>}
        {shown.map((a) => {
          const f = formats[a.id] ?? "post";
          const fl = formatsOf(a.platform).find((x) => x.key === f)?.label;
          const ig = a.platform.startsWith("instagram");
          const story = f === "story";
          const av = a.picture ? <img className="sm-av" src={a.picture} alt="" /> : <span className="sm-av">{(a.label || "?").slice(0, 1)}</span>;
          return (
            <div key={a.id}>
              <div className="sm-shl"><PfMark platform={a.platform} />{a.label}{f !== "post" && fl ? ` · ${fl}` : ""}</div>
              <div className="sm-sh">
                <div className="sm-hd">{av}<div className="sm-who"><b>{a.handle && ig ? a.handle.replace(/^@/, "") : a.label}</b><span>{a.handle && !ig ? `${a.handle} · ` : ""}{when}</span></div></div>
                {ig && !images.length ? <div className="sm-need">Instagram 一定要有圖片或影片。</div> : null}
                {!(ig && story) && <div className="sm-tx"><Text text={textFor(a)} platform={a.platform} /></div>}
                {images.length > 0 && (
                  <div className={`sm-imgs sm-n${Math.min(images.length, 4)}${story ? " sm-tall" : ""}`}>
                    {images.slice(0, story ? 1 : 4).map((p, i) => mediaKinds?.[i] === "video" ? <video key={p} src={p} muted controls preload="metadata" /> : <img key={p} src={p} alt="" />)}
                  </div>
                )}
                {parts.length > 0 && !story && (
                  <div className="sm-cms">
                    <span className="sm-muted">貼文發出後，用你的帳號在下面留言</span>
                    {parts.map((c, i) => {
                      const path = c.media_id && commentImage(a.platform) ? mediaPath(c.media_id) : null;
                      return (
                        <div className="sm-cm" key={c.key}>
                          <b>{a.label}</b> <Text text={c.body} platform={a.platform} />
                          {path && <img src={path} alt="" />}
                          {c.media_id && !commentImage(a.platform) && <span className="sm-muted">這個平台的留言不帶圖，只發文字。</span>}
                          <span className="sm-muted">{delayText(c.delay, i === 0)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
