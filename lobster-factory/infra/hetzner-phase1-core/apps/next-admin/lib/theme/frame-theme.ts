// The app → embedded tool theme protocol, one place (operator 2026-11-05: "照 video 的模式：app 傳顏色過去").
// The tool posts THEME_READY; the app answers THEME with every theme token's current computed value, and sends it again
// whenever <html> style/class/data-theme changes or a themechange event fires; the tool answers THEME_APPLIED.
// Users: app/(full)/tools/vector-pro/VectorProFrame.tsx. components/tools/AwareWaveThemeFrame.tsx (video workbench)
// speaks the same protocol with its own literals and should import connectThemeFrame from here instead.
import { ALL_TOKEN_GROUPS } from "./tokens";

export const THEME_READY_CHANNEL = "awarewave:theme-ready";
export const THEME_CHANNEL = "awarewave:theme";
export const THEME_APPLIED_CHANNEL = "awarewave:theme-applied";

/** Every token the theme editor can set (lib/theme/tokens.ts): what an embedded tool needs to look like the app. */
export const THEME_TOKEN_NAMES: readonly string[] = ALL_TOKEN_GROUPS.flatMap((group) => group.tokens.map((token) => token.name));

export function readThemeTokens(style: Pick<CSSStyleDeclaration, "getPropertyValue">): Record<string, string> {
  return Object.fromEntries(THEME_TOKEN_NAMES.map((name) => [name, style.getPropertyValue(name).trim()]));
}

/** Serve the theme to one iframe. Messages count only from that iframe's window at `origin`. Returns the cleanup. */
export function connectThemeFrame(frame: HTMLIFrameElement, origin: string, onApplied: () => void): () => void {
  const send = () => {
    frame.contentWindow?.postMessage({ channel: THEME_CHANNEL, tokens: readThemeTokens(getComputedStyle(document.documentElement)) }, origin);
  };
  const receive = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    if (event.data?.channel === THEME_READY_CHANNEL) send();
    if (event.data?.channel === THEME_APPLIED_CHANNEL) onApplied();
  };
  const observer = new MutationObserver(send);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });
  // A server-rendered iframe can load (and say ready) before this runs: send on its load too, and once now. The browser
  // drops a post only when the iframe sits on another origin; a same-origin about:blank or 404 page receives it, so this
  // channel carries public data only (theme values).
  frame.addEventListener("load", send);
  send();
  window.addEventListener("message", receive);
  window.addEventListener("awarewave:theme-change", send);
  window.addEventListener("themechange", send);
  return () => {
    observer.disconnect();
    frame.removeEventListener("load", send);
    window.removeEventListener("message", receive);
    window.removeEventListener("awarewave:theme-change", send);
    window.removeEventListener("themechange", send);
  };
}
