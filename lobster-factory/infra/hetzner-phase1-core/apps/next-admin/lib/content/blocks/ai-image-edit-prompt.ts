/**
 * ai-image-edit-prompt.ts — `ai/image-edit-prompt` 生圖後修改 prompt 積木。
 *
 * 用 Content Studio 同一組 Claude/OpenAI 文字模型，把「我要怎麼改這張已生成圖片」
 * 轉成可交給 image-to-image / inpaint / generative fill 的英文 edit prompt。
 */
import { register, type BlockCtx } from "./registry";
import { generateImageEditPrompt, type ImageEditPromptInput, type ImageEditPromptResult } from "../../studio/image-edit-prompt";

register({
  id: "ai/image-edit-prompt",
  title: "AI 修圖 Prompt 產生器",
  icon: "✏️",
  kind: "ai",
  enabled: true,
  run: async (ctx: BlockCtx): Promise<ImageEditPromptResult> => {
    return generateImageEditPrompt(ctx as ImageEditPromptInput);
  },
});
