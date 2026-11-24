# K13 生圖來源實測（監工；K25 併入並部署後；取代 `K10-K12.md` 的 K13 段）

操作者 2026-11-24：目的＝**哪一個來源能畫出符合文章內容的圖**。她已說完開測前要說的話（封面＋內文、4:3、B 版型、風格、可以有人物但要貼題）；版型與設定要先做完（K10、K24、K25），所以排在 K25 之後。開跑前仍在對話裡告知一聲。

- 素材：K12 她排名第一的那篇文章。畫面描述由寫出那篇文章的同一個文字模型、用 K10 上線的指令寫（封面一句＋三個內文位置各一句）；監工不代寫、不潤飾。
- 每個候選四張：封面底圖 1（16:9，會被套進 4:3 的 B 版型）＋內文圖 3（4:3）。風格：網站設定的風格（未設＝照片感預設）。
- 候選：`codex-image`（ChatGPT 訂閱，NT$0，量每張耗時與額度）、Pexels 圖庫（免費，用描述的關鍵字找）、付費模型 `flux-schnell`（現在的預設）、`flux-2-klein-4b`、`flux-dev`、`nano-banana-2`、`openai-low`（目錄 `public/editor-shared/image-models.js`；以當時目錄為準）。另加一組「現在的做法」對照：`flux-schnell`＋中文替代文字。
- 走 `lib/tarot/image-gen.ts` `generateTarotImage`（成本進 `ai_call_logs`，`costLog.route` = `probe/image-bakeoff`）；封面用正式的 `renderCover` 套版。預估付費約 NT$10–15。
- 產出：並排比較頁（來源遮成編號、另附對照表；每張圖旁附它對應的段落原文、實扣 NT$、耗時）發布給操作者；她選出預設來源後 → 改 K10 留下的預設模型、寫進 `app/(shell)/tools/ai-models/MeasuredRuns.tsx` 新組「文章配圖」；圖存 `agency-os/reports/model-bakeoff/2026-11-article-image/`。
- 她選完後另談：圖片來源的順序（訂閱 → Pexels → 付費，付費預設關閉——監工 11-24 的建議，她尚未回答）、IG 直式 4:5 封面（她已同意，第二步）。
