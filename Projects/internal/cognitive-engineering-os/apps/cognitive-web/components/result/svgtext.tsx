import React, { useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";

// Text inside a drawing wraps; it is never cut (operator 2026-09-27: 「文字也被截斷…這樣有人可以看懂嗎」). `Wrap` is an HTML
// block inside the SVG (foreignObject) so the browser wraps it; `linesFor` estimates the lines it will take (a CJK
// character is one em wide, latin about half), so a band or a box can be sized by its text before it is drawn.
const wide = (ch: string) => /[←-⯿①-⓿⺀-￿]/.test(ch);   // CJK, circled digits, arrows and stars draw one em wide
export function textWidth(text: string, size: number): number {
  return Array.from(text).reduce((sum, ch) => sum + (wide(ch) ? size : size * 0.55), 0);
}

export function linesFor(text: string, width: number, size: number): number {
  let line = 0;
  let count = 1;
  for (const token of text.match(/[A-Za-z0-9.,%$-]+|[\s\S]/gu) ?? []) {   // a latin word or number moves to the next line whole
    const w = textWidth(token, size);
    if (line > 0 && line + w > width) { count += 1; line = w; } else line += w;
  }
  return count;
}

export const lineHeight = (size: number) => Math.round(size * 1.35);

// P-16: the estimate can fall short of what the browser wraps (bold, a font's own widths) and a box sized by it lets its
// text run over the next one. After mount the browser's own count replaces it: a hidden probe with the Wrap block's
// styles at the same width in the drawing's units (a foreignObject lays its text out before the SVG scales it). The
// first render (server, tests without layout) keeps the estimate, so server and client HTML agree. `tail` = a part
// kept on one line (an inline-block), as the Wrap draws it.
export type Lines = (text: string, width: number, size: number, options?: { bold?: boolean; tail?: string }) => number;
let probe: HTMLDivElement | undefined;
function browserLines(text: string, width: number, size: number, bold?: boolean, tail?: string): number | undefined {
  if (typeof document === "undefined" || !document.body) return undefined;
  if (!probe || !probe.isConnected) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    Object.assign(probe.style, { position: "absolute", left: "-10000px", top: "0", visibility: "hidden", overflowWrap: "anywhere", wordBreak: "break-word" });
    document.body.appendChild(probe);
  }
  Object.assign(probe.style, { width: `${width}px`, fontSize: `${size}px`, lineHeight: `${lineHeight(size)}px`, fontWeight: bold ? "700" : "" });
  probe.textContent = text;
  if (tail) { const kept = document.createElement("span"); kept.style.display = "inline-block"; kept.textContent = tail; probe.appendChild(kept); }
  const height = probe.getBoundingClientRect().height;
  return height > 0 ? Math.max(1, Math.round(height / lineHeight(size))) : undefined;   // no layout (jsdom): the estimate
}
const estimate: Lines = (text, width, size, options) => linesFor(text + (options?.tail ?? ""), width, size);
export function useLines(): Lines {
  const [pass, setPass] = useState(0);   // 0 = not mounted yet; 2 = measured again once web fonts have loaded
  useLayoutEffect(() => {
    let live = true;
    setPass(1);
    document.fonts?.ready.then(() => { if (live) setPass(2); });
    return () => { live = false; };
  }, []);
  return pass ? (text, width, size, options) => browserLines(text, width, size, options?.bold, options?.tail) ?? estimate(text, width, size, options) : estimate;
}

export function Wrap({ x, y, width, height, size = 13, className, bold, align, children }: {
  x: number; y: number; width: number; height: number; size?: number; className?: string; bold?: boolean; align?: "center"; children: ReactNode;
}) {
  return <foreignObject x={x} y={y} width={width} height={height} style={{ overflow: "visible" }}>
    <div className={className} style={{ fontSize: size, lineHeight: `${lineHeight(size)}px`, fontWeight: bold ? 700 : undefined, textAlign: align, overflowWrap: "anywhere", wordBreak: "break-word" }}>{children}</div>
  </foreignObject>;
}
