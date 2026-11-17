import { expect, it } from "vitest";
import { STYLE_CATALOG } from "../../../(shell)/tools/tarot/tarotStyles";
import { resolveStylePrompt } from "../../../(shell)/tools/tarot/cards";
import { VIDEO_STYLE_CATALOG, VIDEO_STYLE_PRESETS, WORKBENCH_LEGACY_STYLES, resolveVideoStyle, videoStyle } from "@/public/editor-shared/video-styles.js";

it("one list contains all 103 unchanged art styles, three video presets and all nine legacy workbench values", () => {
  expect(STYLE_CATALOG).toHaveLength(103); expect(VIDEO_STYLE_PRESETS).toHaveLength(3); expect(WORKBENCH_LEGACY_STYLES).toHaveLength(9);
  expect(VIDEO_STYLE_CATALOG).toHaveLength(115); expect(new Set(VIDEO_STYLE_CATALOG.map(s => s.id)).size).toBe(115);
  for (const row of STYLE_CATALOG) {
    expect(resolveVideoStyle(row.zh)).toBe(resolveStylePrompt(row.zh));
    expect(videoStyle(row.zh)?.prompt).toBe(row.prompt);
  }
});
it("old index and saved label resolve identically to stable ids; custom text stays literal", () => {
  WORKBENCH_LEGACY_STYLES.forEach((s, i) => { expect(videoStyle(i)?.id).toBe(s.id); expect(resolveVideoStyle(i)).toBe(resolveVideoStyle(s.id)); });
  expect(resolveVideoStyle("電影感")).toBe(resolveVideoStyle("video-cinematic"));
  expect(resolveVideoStyle("客戶自訂：黑底金光")).toBe("客戶自訂：黑底金光");
});
