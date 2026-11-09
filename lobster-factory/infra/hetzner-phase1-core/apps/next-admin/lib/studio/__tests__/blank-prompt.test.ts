// 「這顆可以留空嗎」 has one answer, in the catalog. The guide prints it and ai-fill.js refuses to spend without it,
// so a 填色 / 去除 row that forgets to declare it, or a panel that stops asking, is a test failure rather than a
// full-price no-op the operator discovers by paying for it (2026-11-09: 留空 on the two mask-less models returned
// the image untouched and still billed).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { modelsFor, takesBlankPrompt, takesChinese } from "../model-options";

const panel = fs.readFileSync(path.join(process.cwd(), "public/editor-shared/blocks/ai-fill.js"), "utf8");

describe("blank description", () => {
  it("every 填色 and 去除 button says what an empty description does", () => {
    const undeclared = [...modelsFor("fill"), ...modelsFor("remove")].filter((m) => m.blank !== "ok" && m.blank !== "no");
    expect(undeclared.map((m) => m.value)).toEqual([]);
  });

  it("the two mask-less models do not accept a blank description", () => {
    for (const value of ["flux-2-klein-4b", "flux-kontext-fast"]) {
      const row = modelsFor("fill").find((m) => m.value === value);
      expect(row, `${value} missing from 填色`).toBeTruthy();
      expect(takesBlankPrompt(row!), `${value} must require a description`).toBe(false);
    }
  });

  it("Ideogram's cheap tier does accept one, since the guide tells her to use it that way", () => {
    const row = modelsFor("fill").find((m) => m.value === "ideogram-4-5-edit-low");
    expect(takesBlankPrompt(row!)).toBe(true);
  });

  it("the fill panel refuses to send a blank description to a model that cannot use it", () => {
    expect(panel).toMatch(/takesBlankPrompt/);
    // The guard must sit before setBusy, i.e. before anything is sent or held.
    const guard = panel.indexOf("!takesBlankPrompt(m)");
    const spend = panel.indexOf("setBusy(true)", guard);
    expect(guard).toBeGreaterThan(-1);
    expect(spend).toBeGreaterThan(guard);
  });

  it("the panel no longer promises 可留空 for every button", () => {
    expect(panel).not.toMatch(/（可留空＝照周圍補）/);
  });
});

describe("instruction language", () => {
  it("every 填色 button says whether a 繁中 instruction works", () => {
    // 去除 and 擴圖 take no description, so they declare no language and show none on the button.
    const undeclared = modelsFor("fill").filter((m) => m.zh !== "ok" && m.zh !== "no");
    expect(undeclared.map((m) => m.value)).toEqual([]);
  });

  it("the buttons that take no description declare no language", () => {
    const noisy = [...modelsFor("remove"), ...modelsFor("outpaint")]
      .filter((m) => m.uses.every((u) => u === "remove" || u === "outpaint") && m.zh !== undefined);
    expect(noisy.map((m) => m.value)).toEqual([]);
  });

  it("Kontext Fast needs English; the other fill buttons take 繁中", () => {
    const row = (v: string) => modelsFor("fill").find((m) => m.value === v)!;
    expect(takesChinese(row("flux-kontext-fast")), "two 繁中 presses left the animals in place").toBe(false);
    for (const v of ["ideogram-4-5-edit-low", "flux-2-klein-4b", "openai-26-edit"]) {
      expect(takesChinese(row(v)), `${v} removed the animals from the 繁中 sentence`).toBe(true);
    }
  });

  it("the panel tells her which language a button needs", () => {
    expect(panel).toMatch(/takesChinese\(m\)/);
  });
});
