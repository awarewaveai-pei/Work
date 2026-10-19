// The smart link page itself (SOCIAL_MANAGER_PLAN.md C26; mock v16 renderSmart .phone): the public page renders it at
// /smartlink/<slug> and the editor's preview renders the same component in a narrow frame. No hooks: it renders on the
// server (public) and in the client editor. Only what the brand typed onto the page is shown.
import type { CSSProperties } from "react";
import { TAG_TOKEN } from "../model";
import "./link-page.css";

export interface LinkPageProps {
  title: string; bio: string; colour: keyof typeof TAG_TOKEN;
  /** href absent = the preview: the button is not a link */
  items: Array<{ id: string; title: string; href?: string }>;
}

export default function LinkPage({ title, bio, colour, items }: LinkPageProps) {
  const style = { "--sl-c": `var(${TAG_TOKEN[colour]})` } as CSSProperties;
  return (
    <div className="sl-page" style={style}>
      <span className="sl-av" aria-hidden="true">{title.trim().slice(0, 1) || "?"}</span>
      {title && <h1 className="sl-title">{title}</h1>}
      {bio && <p className="sl-bio">{bio}</p>}
      <div className="sl-links">
        {items.map((i) => (i.href
          ? <a key={i.id} className="sl-btn" href={i.href} rel="noopener">{i.title}</a>
          : <span key={i.id} className="sl-btn">{i.title}</span>))}
      </div>
    </div>
  );
}

/** What a visitor sees on a page that is not published, or does not exist (the same words for both). */
export function LinkPageClosed() {
  return (
    <div className="sl-page">
      <h1 className="sl-title">這頁還沒開放</h1>
      <p className="sl-bio">請晚一點再來看看。</p>
    </div>
  );
}
