// R1: the cover title (src/cover-layout.ts) stays inside each ratio's safe area -- wrapped, then smaller down to the
// floor, then cut with "…". The estimate (textEm) is what the composition draws by, so line width = textEm x fontSize.
const assert = require("node:assert/strict");
const test = require("node:test");
const { layoutCover, wrapLines, textEm, coverFormatKey, COVER_FORMATS } = require("../dist/cover-layout.js");

const TITLES = {
  short: "失眠怎麼辦",
  cjk: "為什麼你明明很累卻還是睡不著？心理師教你三個晚上就能用的放鬆方法，讓大腦慢慢安靜下來，不再半夜醒來滑手機",
  latin: "Why You Cannot Sleep Even When You Are Exhausted And What Actually Helps Tonight",
  mixed: "ADHD 大人的時間管理：3 個不靠意志力的 Productivity 方法",
  word: "Supercalifragilisticexpialidocious".repeat(4),
};

test("every title line stays inside the safe area of 16:9, 9:16, 4:5 and 1:1", () => {
  for (const [key, f] of Object.entries(COVER_FORMATS))
    for (const [name, title] of Object.entries(TITLES))
      for (const subtitle of ["", "Soulful Expression 身心靈"]) {
        const l = layoutCover({ width: f.width, height: f.height, title, subtitle });
        const where = `${key} ${name} sub=${!!subtitle}`;
        assert.equal(l.format, key);
        assert.ok(l.lines.length >= 1 && l.lines.length <= f.maxLines, where);
        for (const line of l.lines) assert.ok(textEm(line) * l.fontSize <= l.box.width, `${where}: "${line}" wider than the safe box`);
        if (l.subtitle) assert.ok(textEm(l.subtitle.text) * l.subtitle.fontSize <= l.box.width, where);
        assert.ok(l.blockTop >= l.box.top, `${where}: block above the safe area`);
        assert.equal(l.box.left, Math.round(f.width * f.safe.left));
        assert.ok(l.box.top + l.box.height <= f.height * (1 - f.safe.bottom) + 1, where);
        assert.ok(l.fontSize >= Math.round(Math.min(f.width, f.height) * 0.06), `${where}: under the floor`);
      }
});

test("a short title is big; a long one shrinks, then is cut with an ellipsis", () => {
  const f = COVER_FORMATS["16x9"];
  const big = layoutCover({ width: f.width, height: f.height, title: TITLES.short });
  assert.equal(big.fontSize, Math.round(1080 * 0.12));
  assert.deepEqual([big.lines, big.truncated], [["失眠怎麼辦"], false]);
  const long = layoutCover({ width: f.width, height: f.height, title: TITLES.cjk.repeat(3) });
  assert.equal(long.truncated, true);
  assert.equal(long.fontSize, Math.round(1080 * 0.06));
  assert.match(long.lines.at(-1), /…$/);
  // Upper-cased like the 片頭 title.
  assert.equal(layoutCover({ width: 1080, height: 1350, title: "calm mind" }).lines.join(" "), "CALM MIND");
});

test("line breaks: Latin words stay whole, CJK breaks anywhere, closing punctuation never starts a line", () => {
  assert.deepEqual(wrapLines("HELLO WORLD AGAIN", 8), ["HELLO", "WORLD", "AGAIN"]);
  const lines = wrapLines("一二三四五，六七", 5.3);
  for (const l of lines) assert.ok(!/^[，。、！？：；）」』》]/.test(l), JSON.stringify(lines));
  assert.equal(lines.join(""), "一二三四五，六七");
  for (const l of wrapLines("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 5)) assert.ok(textEm(l) <= 5, l);
});

test("only the four render formats have a layout", () => {
  assert.equal(coverFormatKey(1280, 720), "16x9");
  assert.equal(coverFormatKey(720, 1280), "9x16");
  assert.equal(coverFormatKey(864, 1080), "4x5");
  assert.equal(coverFormatKey(1000, 1000), "1x1");
  assert.equal(coverFormatKey(1440, 1080), null);
  assert.throws(() => layoutCover({ width: 1440, height: 1080, title: "x" }), /no cover layout/);
});
