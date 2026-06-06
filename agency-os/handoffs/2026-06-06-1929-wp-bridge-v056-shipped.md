---
slug: wp-bridge-v056-shipped
created_utc: 2026-06-06T11:29:29Z
hint: "wp-bridge v0.5.6 shipped — Kadence content engine: accordion pane id fix + Tabs/YouTube blocks + PostCreator wp_slash fix; released; next = blocks endpoint / styling param / sell-path; strategy = agency-infra > product"
source_session_summary: "Built/fixed the wp-bridge Kadence block library to v0.5.6, released it, and discussed whether to sell the plugin vs use it as agency infrastructure."
---

# wp-bridge v0.5.6 — Kadence 內容引擎(積木盒)交接

## 1. 任務目標
讓 AI 能在 WordPress(Kadence)站上寫出**編輯器有效**的完整文章。引擎 = `BlockLibrary.php`(server-side LEGO,AI 送 `{type,content}` JSON → `compose()` 組成有效 Kadence markup)。v0.5.6 已上線、16 種積木可用。下一步是「賣相工程」或轉攻 app.aware-wave Stage 1。

## 2. 為什麼做
定時驗收 + 方向待拍板。本 session 功能已完成且發佈;剩「使用者編輯器驗收」+「下一步方向選擇」。

## 3. 已試過(本 session 完成,勿重做)
- **Accordion 真因**:現行 Kadence `kadence/pane` 第 2+ pane 必須帶 `"id":N`(第一個省略,預設 id=1)。舊 code 全不帶 → editor "unexpected content"。前一輪誤加 className/dup-class 是錯的(已移除)。
- **wp_slash bug**:`PostCreator` 未 `wp_slash()` → `wp_insert_post` 內部 `wp_unslash()` 吃掉反斜線 → tabs titles `<strong` 變 `u003cstrong`。已修。
- 新增 `tabs()`(kadence/tabs>tab)、`youtube()`(core/embed);`compose()` switch 抽出 `buildInner()` 讓 tab 可嵌任意 block。
- 已 commit(auto-checkpoint)+ WORKLOG(今日「wp-bridge v0.5.6」區塊,含 4 動作)+ GitHub release v0.5.6(repo source + 可安裝 zip,Latest)。soulful 站已 scp 跑 v0.5.6(不用重裝)。
- 驗證 post:7053(tabs+youtube+accordion)、7056(多元神經文章乾淨重生,沿用圖 7041/7042)。測試草稿 7049/7050/7052 已 trash。

## 4. 卡在哪
非阻塞。等兩件事:① 使用者開 7053/7056 確認編輯器無 invalid content;② 使用者拍板下一步方向(見 §5)。

## 5. 下一步指令
方向是使用者選的,先確認再動。三個候選:

1. **app.aware-wave Stage 1(master plan 指定下一步,推薦)** — 接通 onboarding 入口。
   - 先讀 `$WORK_ROOT/agency-os/docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md` §3 Stage 1 + `git log -5`(VBC,`trigger-build/route.ts` 被平行 session 動過)。
   - 抓 2 筆卡 `spec_generated` 的 intake_forms,`POST /api/onboarding/trigger-build` 看精確錯誤碼(最可疑:公開流程沒 ops role → 403,或 UI 沒帶 spec/intake id)。

2. **wp-bridge `/blocks` 自描述端點** — 在 `$WORK_ROOT/lobster-factory/packages/wp-bridge-plugin/includes/Http/RestController.php` 加唯讀 `GET /aware-wave-bridge/v1/blocks`,從 BlockLibrary 自動吐支援的 type + 欄位(讓 app/AI 不靠手寫 doc、不漂移)。

3. **tabs/infobox 樣式參數化(販售前置)** — `tabs()`/`infobox()` 目前硬編 soulful palette(`titleColor`/`titleBg`/border)。抽成 spec 傳入或 plugin 設定預設,否則換站/賣人會套到她的配色。

## 6. 相關資源
- **Files**:
  - `$WORK_ROOT/lobster-factory/packages/wp-bridge-plugin/includes/Content/BlockLibrary.php`(引擎,16 積木 + `buildInner`/`tabs`/`youtube`/`attrsJson`)
  - `$WORK_ROOT/lobster-factory/packages/wp-bridge-plugin/includes/Post/PostCreator.php`(`wp_slash` 修復處)
  - `$WORK_ROOT/lobster-factory/packages/wp-bridge-plugin/includes/Http/RestController.php`(REST,`sideloadBlockImages` 只掃 top-level image)
  - `$WORK_ROOT/agency-os/docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`(另一條線 SSOT)
- **External**:
  - Plugin repo + release:`https://github.com/awarewaveai-pei/aware-wave-wp-bridge/releases/tag/v0.5.6`
  - soulful SSH:`ssh -i ~/.ssh/hostinger_soulful -p 65002 u942075013@191.101.230.176`;plugin 路徑 `~/domains/soulfulexpression.org/public_html/wp-content/plugins/aware-wave-wp-bridge/`
  - WP-CLI 測試法:`wp eval-file`(server PHP 有 sodium_compat;本機 PHP 無 sodium/ZipArchive)
- **Known landmines**:
  - 本機 PHP 無 sodium、無 ZipArchive → 簽章/打包要在 server(WP-CLI)或用 Python(zip)。
  - `wp_insert_post` 會 `wp_unslash` → 任何含反斜線跳脫的 block 屬性都要先 `wp_slash`。
  - tab 標題 anchor slug 用 `[^a-zA-Z0-9]` strip → **CJK 標題會變空 slug**(目前只支援英文 tab 標題)。
  - tab 內嵌 image 不會被 `sideloadBlockImages` 預處理(只掃 top-level)。
  - **SE-01 私鑰仍外洩**(曾貼入對話)→ 待輪替:WP 後台 → AwareWave Bridge → Revoke SE-01 → 重生 → 新私鑰貼進 `C:\Users\user1115\AWARE_WAVE_CREDENTIALS.md`(勿貼對話)。
  - 策略結論:plugin 當商品賣價值普通(Kadence 版本維護地獄 + 市場窄 + 平台風險);當 agency 基礎設施(AI 代管 WP 當服務)更值錢。
