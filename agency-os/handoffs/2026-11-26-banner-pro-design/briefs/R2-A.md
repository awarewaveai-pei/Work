# R2-A 排版引擎 — 先讀 COMMON.md
規格：../PLAN-R2.md §5「R2-A」第 1–7 點與驗收 (a)–(d)。根因：§2 表第 1、4(1)(2)(3)、9 列。
檔案（只動這些）：B/banner-layout.ts（新）、B/field-ranges.ts（新）、B/banner-layers.ts、B/banner-design.ts、lib/script-forge/modules.ts（banner 的 design 段與 bannerSizesPart）、對應測試檔。B = app/(shell)/tools/banner/。
不動：BannerStudio.tsx（另一個工人 R2-B1 正在拆它）、product-grounding.ts（只改它在 banner-layers.ts 的呼叫端）。
已知事實：State 沒有持久化；片頭模板（templatePatch，BannerStudio.tsx:548-552）靠指定字級，新欄位缺省值必須讓現有 UI 行為不變（typeAuto 缺省 false、logoPos 缺省 bl）。
已排除：不改 product-grounding 演算法本身；不在 BannerStudio 接線（R2-B2 做）。
applySemantic：寫成泛型純函式，作用在含 positions 的物件上；多尺寸 sizeOverrides 的清法寫在函式註解，R2-B2 接線時照用。
