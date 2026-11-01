# JSON 格式請求 400 修正 — 2026-11-01

問題：OpenAI 回報 Response input messages must contain the word json。共用 Responses 請求原先只在 instructions 內指定 JSON，輸入訊息沒有明確要求。

修正：JSON 模式統一加入固定 developer 訊息，明確要求回覆 JSON object；原始 user 文字與參考圖片完整保留。一般文字回覆請求不變。

依據：[OpenAI 官方結構化輸出文件](https://developers.openai.com/api/docs/guides/structured-outputs)。

驗證：

- json-mode.cjs 使用嚴格 provider mock 重現錯誤；舊 helper 確實得到 400，同一測試在修正後通過。
- 短影音分析、含圖導演與一般歌詞請求格式驗證通過。
- 導演多輪對話、商品腳本、工具流程與後端回歸測試通過。
- 已更新正在使用的下載版本並重新啟動 4178，沒有中斷中的任務；素材與草稿保留。
- 使用合成的兩秒中文台詞，對 4178 實際送出一次短影音分析請求；真實 OpenAI 成功回傳可解析的 JSON，含一個有效片段。不含私人影片或資料。
- Claude 唯讀跨模型審查 approve，未找到問題。此資料夾沒有 Git，使用凍結檔及 SHA256，不冒稱 Git ORACLE gate artifact。

審查原文：

```json
{"verdict":"approve","findings":[],"summary":"I read the diff and the text() helper in the frozen api.cjs, lines 96-134, and found no problems. I did not run the regression tests. When json=true, the input becomes a developer message that contains the word 'JSON', followed by the original user input_text and any images. That satisfies OpenAI's rule that the input must mention JSON when json_object format is used. A developer message with plain string content is valid for /responses. The user content is the same as before, so the instructions, max_output_tokens and text.format parameters are unchanged. When json=false, the request is the same as before: a plain string with no images, or one user message with images. One small change: the userContent array is now built even when there are no images, but with an empty images list it does no work. imageReference runs in the same cases as before (only for image entries), so its path checks and errors are unchanged. The developer message is a fixed string with no user data in it, so it adds no injection risk, and the existing prompts that treat user input as data still apply. Every JSON caller now gets the extra message (the clip, translation and director prompts at lines 636, 648 and 688, plus the others that pass true). The lyrics call at line 643 keeps json=false and is unchanged."}

```

最終 backend/api.cjs SHA256：`8a3842c3019beebc4c938f1c760ffbe237d887173c787319c8e3b638df5dbee2`
