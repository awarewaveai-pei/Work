# R2-C AI 文案多版本＋品牌整組 — 先讀 COMMON.md
規格：../PLAN-R2.md §5「R2-C」第 1、1b、2、3 點（操作者更正：多版本＝同一設計附五組文案可換，一次呼叫）。
起點：main 已含 R2-A（banner-layout.ts：layoutBanner、applySemantic）與 R2-B1（steps/*）。
檔案（只動這些）：B/steps/StepAi.tsx、B/steps/StepStyle.tsx、B/kit/*（可新增一個套組套用小模組）、B/banner-design.ts、B/design-colors.ts、lib/script-forge/modules.ts（banner design 段）、對應測試。
不動：banner-state.ts、StepText/StepCanvas/StepMarketing/StepTemplate、banner-layout.ts（R2-B2 同時在改；引擎需要改就寫 RISKS）。
要做：
1. design prompt 多回 copyVariants 五組（headline、subtext、ctaText、badgeText）；sanitize 後在 StepAi 用 .choice-card 列出，第一組預設套用，點哪組換哪組字（版面配色不變）；按鈕價照實算。
2. prompt 告知 hasProduct＋productPos、hasLogo；回 logoPos。
3. AI 設計套用時（StepAi 的 plan.main 與各尺寸）經 applySemantic，不直接蓋欄位。
4. 選的客戶有套組時，AI 設計同時套用套組字體與 logo：把 StepStyle 的 applyBrandKit 抽成 kit/ 下共用函式，StepStyle 與 StepAi 都呼叫它；StepStyle 加 logo 角落按鈕（左下／右下／左上／右上，經 applySemantic）。
5. 對比守門員改用 layoutBanner 算出的真實文字框量背景，取代 BAND_Y 估計（design-colors.ts:55-56 附近）。
驗收：tsc、vitest 綠（sanitize copyVariants、guard 用真實框各一個點名測試）；本機實打一次 AI 一鍵設計（Opus，3 尺寸，付費約 NT$1.6，只打一次）：五張文案卡可換、logo 出現不壓字、console 沒有 contrast not met。截圖存 $env:TEMP。
