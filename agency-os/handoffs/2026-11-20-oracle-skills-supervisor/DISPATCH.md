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
| 3 | Z1 | 擇日（接風水；`lunar-javascript` 已有宜忌）＋風水頁標示流派口徑 | 待定 | 未開 |

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
6. 部署是 High：整批完成後問操作者一次，照 `Projects/internal/ziwei-doushu/deploy/DEPLOY-SG.md`。

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
