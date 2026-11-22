import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolCard, type ToolCardProps } from "../ToolCard";
import { ToolGrid } from "../ToolGrid";
import { rightLabel, type RightInput } from "@/lib/entitlements/right-label";

const NOW = new Date("2026-11-22T00:00:00Z");
const base: RightInput = { entry: { allowed: true, verdict: true, reason: null }, source: "contract", door: "open", viewer: "manager", mode: "enforce" };
const CATALOG = { category: "content", icon: "article", blurb: "寫文章並發布", addedAt: "2026-01-01" } as const;
const card = (over: Partial<RightInput>, p: Partial<ToolCardProps> = {}): ToolCardProps =>
  ({ name: "內容行銷", catalog: CATALOG, right: rightLabel({ ...base, ...over }), href: "https://content.aware-wave.com/", ...p });
const html = (p: ToolCardProps) => renderToStaticMarkup(<ToolCard {...p} now={NOW} />);

const STATES: [string, Partial<RightInput>, Partial<ToolCardProps>, RegExp, RegExp | null][] = [
  ["available (contract)", {}, {}, /方案內/, /<a class="btn-primary" href="https:\/\/content\.aware-wave\.com\/">/],
  ["not held", { door: "not_held", productName: "內容行銷" }, { href: null }, /未開通/, /<button type="button" class="btn-secondary" disabled="">回到我的工作台/],
  ["coming soon", { comingSoon: true }, { href: null }, /即將推出/, null],
];

describe("ToolCard", () => {
  for (const density of ["card", "row", "compact"] as const) {
    describe(density, () => {
      it.each(STATES)("%s: badge text from rightLabel; button only as the label says", (_n, over, p, badge, btn) => {
        const out = html(card(over, { ...p, density }));
        expect(out).toContain(`data-density="${density}"`);
        expect(out).toMatch(badge);
        if (btn) expect(out).toMatch(btn); else expect(out).not.toMatch(/<a |<button/);
        expect(out).toContain("內容行銷");
        expect(out).toContain('data-icon="article"');
      });
    });
  }

  it("a disabled button always has its reason as visible text (not only a tooltip)", () => {
    const out = html(card({ door: "not_held", productName: "內容行銷" }, { href: null, density: "row" }));
    expect(out).toMatch(/data-reason="true">「內容行銷」尚未開通。/);
    expect(out).not.toContain("title=");
  });

  it("keyboard reachable: the action is a native <a href> or <button>, never tabindex or a click-only div", () => {
    const out = html(card({}, { density: "card" }));
    expect(out).toMatch(/<a [^>]*href=/);
    expect(out).not.toMatch(/tabindex|onclick/i);
  });

  it("an allowed tool with an unknown source shows no right badge (nothing guessed)", () => {
    expect(html(card({ source: null }))).not.toContain("data-tone");
  });

  it("the new marker only within 60 days of addedAt", () => {
    expect(html(card({}, { catalog: { ...CATALOG, addedAt: "2026-10-30" } }))).toContain(">新<");
    expect(html(card({}))).not.toContain(">新<");
  });

  it("no colour codes in the markup", () => {
    expect(html(card({ source: "comp" }))).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("ToolGrid", () => {
  it("one list item per tool, and the empty text when there are none", () => {
    const items = [{ key: "a", ...card({}) }, { key: "b", ...card({ comingSoon: true }, { href: null }) }];
    const out = renderToStaticMarkup(<ToolGrid items={items} now={NOW} />);
    expect(out.match(/<li>/g)).toHaveLength(2);
    expect(renderToStaticMarkup(<ToolGrid items={[]} />)).toContain("沒有符合的工具");
  });
});
