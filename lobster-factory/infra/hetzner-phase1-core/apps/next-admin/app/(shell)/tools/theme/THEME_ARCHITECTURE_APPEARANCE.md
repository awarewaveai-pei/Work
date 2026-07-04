# 如何修改外觀 — APPEARANCE GUIDE

> **這份是 admin app 外觀系統的 SSOT（單一真相導覽）。**
> 想改任何「長相」相關的東西（顏色 / 字體 / 主題 / 側欄 / 預設配色）—— 先看這張表，每件事只有一個地方改。
> 線上編輯器：<https://app.aware-wave.com/tools/theme>

---

## 🎯 想改什麼 → 改哪個檔案

| 你想改的東西 | 檔案 | 改哪裡 |
|---|---|---|
| **有哪些可調項目**（新增 / 刪除 token）、預設值、驗證規則 | `lib/theme/tokens.ts` | `COLOR_GROUPS` / `TYPOGRAPHY_GROUPS`（加一筆就多一個可調項）|
| **編輯器頁面長相**（分組顯示、按鈕、文案、Save / Reset 行為） | `app/tools/theme/page.tsx` | UI + `handleSave` / `handleReset` |
| **誰能改外觀**（權限）、API 驗證規則 | `app/api/theme/route.ts` | `canWriteTenantConfig` / 驗證迴圈 |
| **存哪裡 / DB 讀寫 / fail-open / timeout** | `lib/theme/store.ts` | `getThemeConfig` / `saveThemeConfig` |
| **主題怎麼套到每一頁**（注入機制） | `app/layout.tsx` | `<html style={themeStyle}>` |
| **側欄選單項目 / 預設順序** | `app/SidebarNav.tsx` | `DEFAULT_SECTIONS` |
| **出廠預設配色本身** | `app/globals.css` | `:root { … }` |
| **DB 表結構**（加欄位等） | 開**新** migration（`0053_*.sql`…），**別改 `0052`** | `packages/db/migrations/` |

> 路徑相對：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`
> （`packages/db/` 在 repo 根 `lobster-factory/packages/db/`）

---

## 🔁 資料流（一句話）

```
編輯器 page.tsx ──POST──▶ route.ts（驗證+權限）──▶ store.ts ──▶ DB(app_theme)
每頁開機： layout.tsx ──▶ store.ts ──▶ DB ──▶ 注入 <html style>（server 端，跨裝置、無 FOUC）
```

---

## ⚠️ 唯一需要「同步改兩處」的情況

**新增一個可調 token** 時：

1. `app/globals.css` 的 `:root` 加預設值 ← 這是真正的出廠值
2. `lib/theme/tokens.ts` 加同一個 token ← 讓它出現在編輯器、可被驗證

> 這兩個 default **必須一致**。其餘全部單一真相，改一處即可。

---

## 📐 設計原則（為什麼這樣切）

- **單一真相 = DB**（`app_theme` 表，只存改過的 diff；預設留在 `globals.css`，不被覆蓋）。
- **跨裝置**：存伺服器，不是瀏覽器 localStorage → 筆電 / 桌機 / 旅行任何裝置開機都套同一套。
- **fail-open**：DB 掛了 / timeout（1.5s），`layout.tsx` 自動退回 `globals.css` 預設 —— **永遠不會弄壞任何頁面**。
- **無 localStorage、無 FOUC inline script、無重複 token 定義** —— 舊版三套重疊機制已收斂成一套。
- **權限**：只有 owner / admin 能存（`route.ts` 的 `canWriteTenantConfig` 閘）。

---

## 🚀 改完怎麼上線

| 改了什麼 | 上線方式 |
|---|---|
| 只改 `.ts` / `.tsx`（tokens / page / route / layout / SidebarNav） | `npx tsc --noEmit` → `/sg-deploy next-admin` |
| 改 `globals.css` 預設 | 同上（重 build） |
| 改 DB 表結構（新 migration） | 先套 migration 到 prod Supabase（EU，High-risk 要明示 go）→ 再 `/sg-deploy` |
| 只是在編輯器調色 + 按 Save | **不用 deploy** —— 直接存 DB，重整即套用所有裝置 |

> **90% 的調整**（換顏色、字體、加可調項、改文案、調側欄）只碰 `tokens.ts` 或 `page.tsx`，不用碰 DB / API / layout。

---

## 🗂️ 完整檔案清單

| 檔案 | 角色 |
|---|---|
| `lib/theme/tokens.ts` | token 定義 SSOT（可調項 + 預設 + 驗證 regex + SavedLayout 型別）|
| `lib/theme/store.ts` | server 端 DB 讀寫（fail-open）|
| `app/api/theme/route.ts` | API：GET 取目前外觀 / POST 存（含權限閘）|
| `app/layout.tsx` | 每頁 server 端注入主題到 `<html>` |
| `app/SidebarNav.tsx` | 側欄渲染 + 順序（吃 server prop）|
| `app/tools/theme/page.tsx` | 編輯器 UI（操作者實際看到的頁面）|
| `app/globals.css` | 出廠預設 `:root` 變數值 |
| `packages/db/migrations/0052_app_theme.sql` | DB 表 schema（**別改，要動結構開新 migration**）|
| `packages/db/scripts/0052_app_theme_down.sql` | 回滾腳本 |

_最後更新：2026-06-26（外觀系統乾淨重寫：DB 單一真相 + 移除 localStorage hack）_
