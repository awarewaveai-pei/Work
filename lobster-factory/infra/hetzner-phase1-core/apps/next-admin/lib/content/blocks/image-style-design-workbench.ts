/**
 * image-style-design-workbench.ts — `image/style-design-workbench` 萬用生圖風格積木。
 *
 * Tarot Studio 目前是第一個 UI 宿主，但本積木的輸出是通用 `styleAnchor`：
 * model / mode / stylePrompt / subject / refs / seed / providerOptions。POD、Studio、
 * Content image routes 後續都應吃同一個 anchor，而不是各自重寫風格決策。
 */
import { register, type BlockCtx } from "./registry";
import {
  buildStyleAnchor,
  type StyleDesignWorkbenchInput,
  type StyleDesignWorkbenchResult,
} from "../../studio/style-design-workbench";

register({
  id: "image/style-design-workbench",
  title: "萬用生圖風格工作台",
  icon: "🎨",
  kind: "image",
  enabled: true,
  run: async (ctx: BlockCtx): Promise<StyleDesignWorkbenchResult> => {
    return buildStyleAnchor(ctx as StyleDesignWorkbenchInput);
  },
});
