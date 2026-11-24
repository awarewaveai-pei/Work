# K10 文章配圖：畫什麼、什麼風格、幾張（取代 `K10-K12.md` 的 K10 段）

先讀 `briefs/COMMON.md`。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。操作者 2026-11-24 定案；封面的排版（色塊＋標題）不在本卡（K24 做 renderer、K25 接線）。

## 現況（監工已讀）
- 生圖提示詞＝圖的替代文字（中文短句，沒有畫面內容）：`lib/content/topics/make.ts:85` `fillArticleImages`、`:200` `makeContentImage({ model: "flux-schnell", prompt: prompt || t.title, aspectRatio: "16:9" … })`。操作者看到的結果：正念文章配了穿西裝的男人＋亂碼假中文，與內容無關。
- 佔位格式 `![alt](IMAGE_PLACEHOLDER_N)`：`lib/content/article/generate-core.ts:446-459`。
- 自動產文的封面＝內文第一張（`make.ts:208` `featuredImageUrl: images[0]`）。模型寫死 `flux-schnell`（`make.ts:116`、`:200`），沒有讀網站的 `imageModel`（`lib/content/brand-voice.ts:77`）。
- 風格：`lib/content/image/make-image.ts:103,113` 已收 `imageStyle`（英文風格提示詞，來源 `app/(shell)/tools/tarot/tarotStyles.ts` `STYLE_CATALOG`）；手動文章頁有風格與比例兩個下拉選單（`app/(shell)/tools/content/ContentStudio.tsx:3019,3027`，`:254` 註解、`:1615-1619` 解析）；網站預設沒有風格欄位；自動產文不帶風格。
- 網站設定頁 `app/(shell)/tools/content/sites/SiteManager.tsx`（`OptionButtons` 樣式，`:134` 圖片模型）。

## 要的結果
1. **畫面描述**：寫文章的同一次呼叫，為每個內文圖位置多寫一句英文畫面描述，另為封面寫一句（代表整篇主題）。描述＝那一段在講的具體場景（主體、動作、場景、光線），可以有人物；不得要求任何文字。替代文字照舊（給搜尋引擎，不變）。先整段讀佔位指示與所有解析佔位的地方（grep `IMAGE_PLACEHOLDER`，含發佈管線與手動文章頁），選一個既有解析點都仍讀得懂的寫法（例：Markdown 圖片的 title 欄 `![alt](IMAGE_PLACEHOLDER_N "english scene")`）。封面的描述、封面短標題、封面副標放在既有的文章中繼資料輸出裡（先查它現在怎麼輸出 SEO 標題／描述，照同一個機制加欄位，不新增呼叫）。
2. **封面短標題與副標**：短標題 ≤16 個全形字（講這篇是什麼），副標 ≤18 個全形字（講為什麼要看），用文章語言。文章標題本身不變。本卡只負責產出並存進題目的 artifacts／回傳給手動頁；畫上去是 K25。
3. **生圖提示詞**＝英文描述＋風格提示詞＋固定尾句 `No text, no letters, no captions, no watermark.`。沒有描述（舊文章、模型沒照做）→ 退回替代文字，同樣加風格與尾句。`make-image.ts:113` 沒有風格時那句預設（social media graphic…）對文章配圖不適用：文章配圖沒有設定風格時用「照片感」的預設（從 `STYLE_CATALOG` 取一個寫實攝影的項目，寫明是哪一個）。
4. **風格全站固定、單篇可改**：`SiteContentDefaults` 加 `imageStyle`（存 `STYLE_CATALOG` 的鍵，不存提示詞本文）。網站設定頁用看得到的按鈕選（分組照目錄的 group；不用下拉選單——操作者規定）。封面底圖與內文圖用同一個風格。手動文章頁：開啟時帶入網站的風格、比例、模型，可單篇修改，不寫回網站；把 `:3019`、`:3027` 兩個下拉選單改成按鈕。自動產文讀網站的風格。
5. **比例**：封面底圖與內文圖預設都是 4:3（自動產文固定 4:3；手動頁預設 4:3、仍可選其他）。確認 `AspectRatio` 與各模型接受 `4:3`（`contentStudioImageModels.test.ts:55` 已測 flux 類）。
6. **張數**：內文圖 短文章 3 張、其餘 4 張；封面另外 1 張，用封面的描述生成，不再拿內文第一張充當（`make.ts:208`）。在 K25 之前，自動產文的精選圖片＝這張沒有字的封面底圖。`lib/content/topics/cost.ts`（`TOPIC_ARTICLE_IMAGES`、估價）跟著實際張數與模型算。
7. **模型**：讀 `site.defaults.imageModel`；必須是 `generateTarotImage` 能同步出圖的模型（`lib/tarot/image-gen.ts` `isTarotModel`；`codex-image`／pexels 類在這條路能不能用，先查清楚，不能就退回預設並在回報寫明）。預設值本卡不改（仍 `flux-schnell`，等操作者看完實測再定）。
8. 手動文章頁的單張生圖（`app/api/content/image/route.ts`、`ContentStudio.tsx:1645-1648`）同樣改用描述＋風格＋尾句。

## 既有資料
已在 WordPress 的文章不動。沒有描述的舊草稿照舊能出圖（退回替代文字）。網站沒有設定 `imageStyle` → 照片感預設。`featuredImageFont`／`featuredImageTitlePosition` 本卡不碰（K25 處理）。

## 測試（只寫這些）
- 有描述 → 提示詞＝描述＋風格＋尾句；沒有描述 → 替代文字＋風格＋尾句；替代文字原樣進 WordPress（title 欄不得漏進發佈的 HTML）。
- 網站設了風格 → 自動產文帶該風格；沒設 → 照片感預設。
- `imageModel` 合法 → 用它；非法／不能同步出圖 → 預設。
- 短文章 3 張、其餘 4 張，另有 1 張封面且不等於內文第一張；估價跟著變。
- 手動頁帶入網站預設、單篇修改不寫回（一個元件測試）。
- `npx tsc --noEmit`＋`npx vitest run lib/content app/api/content "app/(shell)/tools/content"`。不打付費 API、不真的生圖。

## 邊界
不做封面排版、不改預設模型、不動社群貼文、不部署、不 push。不做無效益測試：只寫上面點名的。根因或結構與上面不同：照實回報。commit（pathspec）。
回報（繁體中文）：FILES／TESTS／COMMITS／RISKS／一個實際產生的佔位行範例＋中繼資料裡封面三個欄位的範例／一句結論。
