# oracle × 外部 skill 派工表（監工用）

續接語：我是 oracle 補強的監工。讀本檔；`mcp__ccd_session_mgmt__list_sessions {linked:true}` 看工人；工人交回照「驗收」做。操作者 2026-11-20 授權：監工派工、選模型、自己判 RISKS，不要問她；回報繁中、金額 NT$。

專案 `Projects/internal/ziwei-doushu/`（oracle.aware-wave.com）。來源五個 skill 與授權：tarot-skill（MIT）、bazi-skill（MIT）、Numerologist_skills／yinyuan-skills／fengshui.skill（無授權，只參考做法）。

## 批次

| 批 | 卡 | 內容 | 模型 | 狀態 |
|---|---|---|---|---|
| 1 | T1 | 塔羅牌間關係＋解讀規則＋3 牌陣 | Sonnet 5.5 | main `d77cf7cda` |
| 1 | B1 | 八字大運流年＋神煞＋合沖刑害 | Opus 5.5 | main `4737bddfc` |
| 1 | H1 | 新系統 合婚＋生肖配對 | Opus 5.5 | main `28ac8fb90` |
| 1 | F1 | 新系統 風水（飛星＋八宅） | Opus 5.5 | main `e77943e36` |
| 1 | — | 監工整合修正＋critic 三條 | — | main `17f71c422` `3380e3973` `ee5bacf58` |
| 2 | S1 | 系統／頁面清單＋干支五行規則表單一來源 | Opus 5.5 | main `bb30d9803` |
| 2 | U1 | `BirthForm` 下拉改按鈕 | Sonnet 5.5 | main `8725f92f1` |
| 2 | Q1 | 新系統 求籤（觀音靈籤，四見證者校勘） | Opus 5.5 | main `0749084cc` `b98c8d003` `8d4751087` |
| 2 | M1 | 新系統 奇門遁甲（黃金案例對盤） | Opus 5.5 | main `736c8ea7c` |
| 2 | — | 監工整合＋critic 一條 | — | main `55c8d5c2a` `de4700215` `4eb025456` |
| 3 | Z1 | 擇日＋八字／風水頁口徑標示 | Opus 5.5 | main `ee1635c6f` `32b1437a9` |
| — | 部署 | `sg-deploy.sh oracle-web`（`c5b2091fd`）；ks-aw-01 上線 `4adb301f3`（2026-11-20 12:34Z） | — | 線上 |

整合方式：detached worktree `D:\Worktrees\Work\oracle-int`（cherry-pick → 解衝突 → `npm ci` → tsc＋全套 vitest → `.claude/launch.json` 的 `oracle-int` 預覽實看）→ rebase 到 `main` → `git merge --ff-only`。批 2 併入順序：S1 先，其餘在它之後（Q1、M1 的 `SystemId`／`FRAMING` 行照 S1 的新寫法併）。

brief 在 `briefs/`（`COMMON.md`＋各卡）。

## 已知結構債（批 1 併入時處理或開 S1）
系統 id 清單寫在 5 處：`lib/divination/types.ts:11`、`lib/divination/index.ts:12-15`、`lib/ai/prompts/systems.ts:12`、`app/api/interpret/route.ts` `SYSTEM_IDS`、`components/SystemNav.tsx:8`。`types.ts:6` 宣稱「新增系統＝實作＋register」與實況不符。H1、F1 各加一行，併入時衝突由監工解。

## 驗收（每張卡）
1. 讀 FILES／TESTS／RISKS → 讀 diff（`git -C <worktree> diff main...HEAD`），`file:line` grep 驗真。
2. cherry-pick 進 `main`（pathspec）；共用檔衝突監工解。
3. 整批併完在專案目錄跑一次 `npx tsc --noEmit`＋全套 `npm test`，再開頁面實看繁中／英文。
4. `clear_session` 清工人；同線下一張用 `send_message` 派。
5. **整批交回後獨立一步「一起看 RISKS」**：並排判，短表回報，再派下一批。
6. 部署是 High：整批完成後問操作者一次，照 `Projects/internal/ziwei-doushu/deploy/DEPLOY.md`。

## RISKS 紀錄
### 批 1（2026-11-20）

| 卡 | 風險 | 處置 |
|---|---|---|
| H1 | `computeBazi` 農曆輸入當國曆排 | 已修 `3380e3973`＋測試 |
| H1 | 八字頁納音顯示簡體 | 已修 `3380e3973`（逐字表＋30 納音測試） |
| H1 | 換人後舊 AI 解讀留在畫面（全工具） | 已修 `3380e3973`／`ee5bacf58` |
| B1→critic | 羊刃辛取子（來源表誤植） | 已修 `ee5bacf58` |
| H1,F1→critic | 只有日期的立春判定三種寫法 | 已修：`lib/liChun.ts` 一個函式 |
| 全部 | Codex 額度到 11/24，無跨模型審查 | critic 審整批 diff（warn 1c/1m/1n 全修）；批 2 照辦 |
| T1 | 工人用 `taskkill /IM node.exe` | `COMMON.md` 加禁令；當時是否誤殺別的服務無法回查 |
| 監工 | 干支五行規則表多份、系統清單 6 處 | 批 2 S1 |
| 既有 | `BirthForm` 三個下拉選單（違反 UI 規則） | 批 2 U1 |
| F1 | 替卦只一例、兼向門檻 4.5°、沈氏口徑 | 口徑差異非錯；批 3 Z1 在頁面標示口徑 |
| B1 | 天乙貴人庚干取聯集；大運用虛歲 | 口徑差異；畫面已標虛歲，不處理 |
| B1 | 每日運勢共用 bazi 框架，未實叫 AI 驗 | 部署後 smoke 時實跑一次每日運勢解讀 |
| F1 | 風水星名在 `systems/fengshui.ts` 與 `messages` 各一份 | 記錄；facts 與畫面用語要改時兩處同步，未開卡 |
| F1 | 分享圖卡無風水專色（用預設金） | 不處理 |
| T1 | 缺席花色門檻 5 張為自訂；下拉改按鈕超出卡面 | 合理，接受 |
| H1,F1 | 立春當天交節前出生可能差一年 | 畫面已提示改用完整八字；不處理 |

### 批 2（2026-11-20）

| 卡 | 風險 | 處置 |
|---|---|---|
| Q1 | 北海觀音與解籤閣共用錯字，非獨立來源 | 已處理：四見證者校勘規則重訂全百首（`lib/qian/data.ts` 檔頭） |
| Q1 | 第 64 籤逐句拼成兩套詩 | 已處理：規則 3b，套用第 32、64 籤 |
| Q1 | 23 句只有單一見證者、5 個籤題只有甲 | 清單由測試鎖定；民間異文，接受。有實體籤本可校時再補 |
| Q1 | 5 個籤題與其餘 95 題典故系列不同 | 接受（乙丁亦互異，無多數可採） |
| M1 | 缺旬首落中五、交節時刻的公開黃金盤 | critic 以規則手推＋實跑三盤（兩個旬首落中五、一個交節後）全合；接受 |
| M1 | 奇門 23:00 換日，八字頁晚子時算當日 | 兩系統各自的通行口徑；批 3 Z1 在八字頁標示口徑 |
| M1 | 用神對應（事業開門、財生門、感情六合、考試景門）為工人所定 | 通行取法，接受；頁面已列口徑 |
| M1→critic | 奇門自帶干支表 | 已修 `4eb025456` |
| S1 | `lib/daily.ts` 遇未知天干改為拋錯 | 合法輸入不變；接受 |
| S1 | 首頁說明鍵名須為 `hub.<slug>Desc` | tsc 會擋；`lib/site.ts` 註解已寫 |
| U1 | 合婚頁未實際操作 | 監工已實按「開始合婚」，正常 |
| 全部 | AI 解讀（籤、奇門、合婚、風水、八字新框架）未對真實模型跑 | 部署後 smoke 每系統實跑一次 |
| 全部 | Codex 無額度 | critic 審整批（pass 0c/0m/1n） |

### 批 3＋部署（2026-11-20）

| 來源 | 風險 | 處置 |
|---|---|---|
| 監工 | 主機無部署路徑、手冊指向退租主機 | 已處理：`oracle-deploy.sh`＋`DEPLOY.md` |
| critic | 部署腳本 4M/3m（rollback 半途結束、訊號不還原、smoke 假失敗、備份含金鑰 644…） | 全修於 `a1750a505` |
| 部署後檢查 | sitemap 24 筆指向 `ziwei.aware-wave.com` | 已修 `043693fa9`，線上 24/0 |
| 監工 | `rollback()` 未實際觸發過 | 未處理；有 tar＋映像雙備份可手動還原 |
| Z1 | 宜避開日原因清單附無關項 | 已修 `32b1437a9` |
| Z1 | 出生年只收年份（1 月–2 月初出生者生肖可能差一年） | 頁面顯示算出的生肖供核對；接受 |
| Z1 | 「簽約」對應立券／交易；忌含「諸事不宜」一律宜避開 | 規則寫在 `lib/zeri.ts` 檔頭；接受 |
| Z1 | 英文頁農曆日期顯示中文 | 接受（農曆日無通行英文寫法） |
| Z1 | 節氣名未併入共用簡→繁表（谷／穀一對多） | 正確判斷，維持整詞表 |
| 全部 | AI 解讀未對真實模型跑 | 已處理：線上七系統 light 各一次皆 200 有文 |

## D1 oracle 併進 `sg-deploy.sh` — 完成（2026-11-20，`c5b2091fd`；上線 `4adb301f3`）
oracle 是 `sg-deploy.sh` 的 app `oracle-web`（`Projects/internal/ziwei-doushu/deploy/DEPLOY.md`）。`oracle-deploy.sh`、產品自己的 compose、主機 `/opt/oracle` 已刪。細節與證據：`agency-os/WORKLOG.md` 2026-11-20 同名條目。
`products.ts` 不登記 oracle（`e0f9cdee6` 加過、`f41ca1bbe` 撤回）：登記的產品必須是 `0110_plans_entitlements.sql` 三個 `product_key` CHECK 接受的值，否則每日補發權益會失敗；要登記須連同一支改這三個 CHECK 的 migration，與 oracle 的帳號／計量同一張卡做。

## 現況
五個外部 skill 的內容全部上線。未排入：紫微夫妻宮／桃花運（yinyuan）、城市五行地圖（fengshui）、每日次數計量與帳號金流（`ORACLE_ROADMAP.md` Phase A）。工人 session 四個皆 idle，可封存。

## 批 5（2026-11-21，來源 `GITHUB_RESEARCH.md` §5）

| 卡 | 內容 | 工人 session | 狀態 |
|---|---|---|---|
| 監工 | 農曆先轉國曆再校正；「今天」取本地日期（`lib/dates.ts`） | — | main `d86262763`，未部署 |
| U2 | iztro 2.5.8→2.6.5；日界單一常數 `'forward'`；回歸測試 | `local_51906081-7b64-41ec-928f-7f2f9e1f019a` | main `f0113fead`，未部署 |
| I1 | 易經卦爻辭（iching-kit 三方校對、繁體）＋七種變爻讀法進 facts 與頁面 | `local_53c300dd-192c-479c-a081-f667eb10780e` | main `01f599b7c`＋`6ebc79425`，未部署 |

卡片全文在各 session 的開場訊息。併入方式同前（`oracle-int` worktree → tsc＋全套 vitest → ff main）。待操作者決定：23 點出生的日界（紫微 `'forward'` 與八字 `sect=2` 現在相反）；塔羅牌圖。未排：`GITHUB_RESEARCH.md` §0.1 標「未排」各列。
RISKS 處置：`agency-os/WORKLOG.md` 2026-11-21「oracle 批 5 併入」。

## 批 6（2026-11-21，操作者：「17 個裡可用的全加 派工」；來源 `GITHUB_RESEARCH.md` §0.1）

卡片在 `briefs/`（先讀 `COMMON.md`＋`COMMON-B6.md`）。日界已定：紫微 `ZIWEI_DAY_DIVIDE='current'`（23 點仍屬當日），與八字一致；依據見 WORKLOG 2026-11-21。

| 卡 | 內容 | 工人 session（沿用） | 狀態 |
|---|---|---|---|
| Z2 | 紫微格局 25→64 條 | `local_2b695d16-feff-4153-b410-a8dca0915081` | main `19fc4a09b`（22→66 條） |
| T2 | 塔羅牌陣（45 種）、密碼學亂數、每日一牌 | `local_1e8cf0f6-0159-4627-ae35-a4845b8667dd` | main `8f92f89dc`＋`5f1776dd3` |
| A1 | 占星本命相位 | `local_617452cb-7ed2-4a4e-8591-0e9160c5b5ac` | main `b0ddcc0c8` |
| I2 | 六爻納甲排盤 | `local_f1c77b0b-cc9f-44ba-a7d1-316911378bd0` | main `e3a90e932`＋`80a028230` |
| D1 | 每日黃曆加料 | `local_51906081-7b64-41ec-928f-7f2f9e1f019a` | main `fa3c31791` |
| T3 | 塔羅牌圖 | `local_1e8cf0f6-0159-4627-ae35-a4845b8667dd` | main `6778e9c43` |
| A2 | 尊貴、阿拉伯點、小限 | `local_617452cb-7ed2-4a4e-8591-0e9160c5b5ac` | main `9e3310a66` |

之後：批 7（`briefs/B7-remaining.md`：A3 行運合盤、A4 時間主星、V1 吠陀、Z3 星曜知識、T4 追問補抽）→ X1 對外 REST（`briefs/X1-public-api.md`）→ X2 MCP（`briefs/X2-mcp-endpoint.md`）。X1 要等所有動到 `lib/divination/systems/*` 的卡併入。操作者 2026-11-21：「那就去做對外的資料介面」「缺介面而沒加的全面補上」。
不做（原因見 `B7-remaining.md` 末節）；react-iztro、lunar-python、ziwei-chart、ichingshifa、iChing-JS（無可取）。
RISKS 處置：`agency-os/WORKLOG.md` 2026-11-21「oracle 批 6 併入六張」。批 7 派工：A3→`local_617452cb…`、V1→`local_f1c77b0b…`、T4→`local_1e8cf0f6…`；A4 等 A3、Z3 等 Z2。
批 7 進度：T4 main `440f9889f`；A3、V1 工人等 critic；Z3 派 `local_2b695d16…`；A4 等 A3。之後 X1 → X2。
批 7 進度：A3 main `b624e6496`、V1 main `c17bc67c6`（＋`6abe3a6a9` 手動合併 `next.config.ts`、`lib/astrology.ts`）；A4 派 `local_617452cb…`；Z3 進行中。
批 8（`briefs/B8-accuracy-completeness.md`，操作者：「最完整完善、最準確」）：E5 時區／夏令時間／晚子時派別 → `local_51906081…`；E7 獨立基準驗證 → `local_53c300dd…`；其餘完整度卡在 X1、X2 之後。需操作者決定的（帳號、金流、推播、好友）不派。
併入（2026-11-21）：A4、E7、Z3（含 critic 修正）、E5、E6a 皆在 main，未部署；RISKS 處置見 WORKLOG 同日「oracle 併入 A3、V1、A4、E7、Z3、E5、E6a」。待派：E6b（接表單）、L1、G1、X1、X2、B8 完整度各卡。
**方向待確認**：操作者要求門面改 WordPress（單獨的網站帳號、訂閱後自動寄信）。確認前不派帳號／寄信／好友合盤；X1 優先度提高（WP 外掛的地基）。

## 現況快照（2026-11-21 晚；接手先讀這段）
- 操作者定案：oracle.aware-wave.com 放 WordPress；帳號用該 WP 站自己的會員；每日寄信 FluentCRM；好友合盤要做；付費訂閱先不做；給全世界用；**站是她的但要照客戶網站的方式管理**；她要「用我們的系統實際操作」把站接到 WP 當練習。
- 設計：`briefs/WP-front-door-plan.md`（9 決定、15 卡、G1–G8）。系統可操作性盤點：`briefs/SYSTEM-OPERABILITY-AUDIT.md`（結論：頁面只能建 `aware-wave.com/staging/<slug>/` 測試站，其餘做不到）。
- main 已有、**全部未部署**：批 5–8 各卡（見上）＋ E6b `fde90441c`、X1 `1ba36f1e1`。合併後 `npx vitest run` 445 passed。部署 oracle-web 屬 High，需操作者明示；部署時要 `sync-host-scripts.sh`（`sg-deploy.sh` 煙霧測試多一行）並在主機確認 nginx 轉送 `X-Real-IP`（X1 限流的前提）。
- 進行中工人：W1 引擎站台簽章與批次 → `local_51906081…`；X2 MCP → `local_53c300dd…`；P1 外掛骨架 → `local_2b695d16…`；E6c 臺灣譯名與時區別名 → `local_f1c77b0b…`（等 critic）。閒置：`local_1e8cf0f6…`、`local_617452cb…`。
- 併入做法：`bash agency-os/handoffs/2026-11-20-oracle-skills-supervisor/pick.sh <sha…>`（在 `D:/Worktrees/Work/oracle-int` 從 origin/main cherry-pick，`.md` 衝突兩邊都留；**程式檔衝突要手動合**）→ `npx tsc --noEmit`＋全套 vitest → `git rebase main` → D:\Work `git merge --ff-only` → push → WORKLOG（`worklog-insert-entry.py`＋私有 index）。
- 待操作者回答（計畫 §4）：每日信要不要附 AI 段落（建議不要）；寄信服務（建議 Amazon SES）；寄送時間（建議當地 7 點）；好友合盤是否限本站會員（建議是）；以客戶「AwareWave 算命站」、自用 0 元、代操登記（建議是）。另：要不要先補系統的建站缺口再練習，或先由工程師手動開站（未問）。
- 之後待派：W2、W3、P2–P4、S1–S6、G-ADR、G-GAP（計畫 §3）；L1 英文補齊、G1 全球實測、B8 完整度各卡；Kerykeion tests/core 未逐行讀（操作者未要求補）。
- 2026-11-21 補：合盤改為**私人合盤**（不需對方是會員、不通知對方），見 `briefs/WP-front-door-plan.md` 檔頭修訂；計畫 §4 第 4 題已答。X2 `d512d1ab5`、P1 `6bed458fe` 工人已 commit 待審併；W1 等 critic。
