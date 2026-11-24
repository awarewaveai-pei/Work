# K23 自動產文的社群貼文：連結改放留言（FB／IG 各自格式）

先讀 `briefs/COMMON.md`。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。操作者 2026-11-24 指定格式（逐字，含換行；`{…}` 為代入值）。

## 現況（監工已讀）
- 自動產文把文章網址寫進貼文的 `link_url`（`lib/content/topics/make.ts:315` `sendSocial`）；`lib/social/compose.ts:97-102` `composeText` 再把網址接在**每個平台**內文最後。操作者要的相反：內文不放網址。
- 留言是整則貼文共用的（`lib/social/store.ts:436` `social_post_comments(position, body, delay_minutes, media_id)`、`:591` `PostChildren.comments`，position 0＝第 1 則留言），不能每個頻道不同。內文可以每個頻道不同（`social_post_targets.custom_body`）。
- 自動產文目前：YouTube 自己一則草稿，其餘頻道共用一則（`make.ts:256-263`）。

## 要的結果（只限自動產文管線產生的貼文；手動貼文、影片貼文、`composeText` 對其他平台的行為都不變）
Instagram（`instagram`、`instagram-standalone`）——內文結尾與第 1 則留言都是：
```
完整文章｜〈{文章標題}〉
點擊「個人檔案連結」，搜尋文章標題
```
送出的內文與留言都不得含網址。

Facebook——內文結尾：
```
完整文章內容請看「留言區」
```
第 1 則留言：
```
完整文章｜〈{文章標題}〉
{文章網址}
```
送出的內文不得含網址；留言的網址照既有規則帶 UTM（`compose.ts:75` `withUtm`，尊重貼文的 UTM 開關）。

## 做法
1. 留言共用 → FB 與 IG 不能同一則草稿。照 YouTube 的前例分組：FB 一則、IG 一則、YouTube 一則、其餘頻道一則（其餘頻道行為照舊：`link_url`＋內文接網址）。先整段讀 `make.ts` 裡所有用到社群草稿 id 的地方（`artifacts.social`、`sendSocial`、影片附加 `:477`、失敗時刪草稿 `:263-271`、review／checks、成本），改成能處理多則；不要只改建立那一處。
2. 結尾與留言在文章發佈、網址已知時寫入（`sendSocial` 那一步），寫成草稿上的真實資料（`custom_body`／`body` 結尾＋`comments`），讓編輯畫面與預覽看得到、改得動。重跑不重複附加（已有就不再加）。人已經排程／送審／刪除的貼文照舊不碰（`:313` 既有規則）。
3. FB、IG 這兩則不設 `link_url`（否則 `composeText` 會把網址接進內文）。先 grep `link_url` 的其他用途（數據、智慧連結、畫面）；若不設會弄壞別的功能，停下回報並提出替代，不要硬做。
4. `{文章標題}`＝實際發佈到 WordPress 的文章標題（不是題目卡的暫定標題，兩者不同時以發佈的為準）。
5. 文字放在一張依網站語言取字的表（`siteLanguage`）：繁中照上面逐字；其他語言給對應的英文句（結構相同）。換行必須保留到送給 Postiz 的內容（`compose.ts:91` `toPostizHtml`）。
6. 限時動態沒有留言（`compose.ts:141`），不加。字數上限、主題標籤上限照既有檢查（結尾加上後超過上限 → 照既有的超限處理，不得靜默截掉結尾）。

## 既有資料
已存在的草稿與已排程貼文不改。上線前建立、尚未發佈文章的題目：之後跑到 `sendSocial` 時若是舊的共用草稿（FB＋IG 同一則）→ 維持舊行為（`link_url`），不半套套用；寫一個測試。

## 測試（只寫這些）
- FB 草稿：最終送出的內文（`composeText`）結尾是指定句、不含網址；第 1 則留言逐字符合、含帶 UTM 的網址、保留換行。
- IG 草稿：內文結尾與第 1 則留言逐字符合、兩者都不含網址。
- 其餘頻道草稿：行為與現在相同。
- 重跑 `sendSocial` 不重複附加。
- 舊的共用草稿維持舊行為。
- `npx tsc --noEmit`＋`npx vitest run lib/content/topics lib/social`。不打付費 API、不真的發文。

## 邊界
不改資料庫結構、不改 `composeText` 對手動貼文的行為、不動社群編輯畫面、不部署、不 push。根因或資料結構與上面不同：照實回報。commit（pathspec）。
回報（繁體中文）：FILES／TESTS／COMMITS／RISKS／實際組出的 FB 與 IG 內文結尾＋留言各貼一份／一句結論。
