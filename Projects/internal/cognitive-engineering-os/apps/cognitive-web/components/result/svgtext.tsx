import React from "react";
import type { ReactNode } from "react";

// Text inside a drawing wraps; it is never cut (operator 2026-09-27: 「文字也被截斷…這樣有人可以看懂嗎」). `Wrap` is an HTML
// block inside the SVG (foreignObject) so the browser wraps it; `linesFor` estimates the lines it will take (a CJK
// character is one em wide, latin about half), so a band or a box can be sized by its text before it is drawn.
const wide = (ch: string) => /[←-⯿①-⓿⺀-￿]/.test(ch);   // CJK, circled digits, arrows and stars draw one em wide
export function linesFor(text: string, width: number, size: number): number {
  let line = 0;
  let count = 1;
  for (const token of text.match(/[A-Za-z0-9.,%$-]+|[\s\S]/gu) ?? []) {   // a latin word or number moves to the next line whole
    const w = Array.from(token).reduce((sum, ch) => sum + (wide(ch) ? size : size * 0.55), 0);
    if (line > 0 && line + w > width) { count += 1; line = w; } else line += w;
  }
  return count;
}

export const lineHeight = (size: number) => Math.round(size * 1.35);

export function Wrap({ x, y, width, height, size = 13, className, bold, align, children }: {
  x: number; y: number; width: number; height: number; size?: number; className?: string; bold?: boolean; align?: "center"; children: ReactNode;
}) {
  return <foreignObject x={x} y={y} width={width} height={height} style={{ overflow: "visible" }}>
    <div className={className} style={{ fontSize: size, lineHeight: `${lineHeight(size)}px`, fontWeight: bold ? 700 : undefined, textAlign: align, overflowWrap: "anywhere", wordBreak: "break-word" }}>{children}</div>
  </foreignObject>;
}
