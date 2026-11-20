# U1 出生資料表單：下拉選單改成看得到的按鈕

先讀 `COMMON.md`。

## 問題
`components/BirthForm.tsx:88`（性別）、`:100`（曆法）、`:136`（出生城市）是 `<select>`。操作者的 UI 規則：不用下拉選單，選項用看得到的按鈕。全站只剩這一個檔有 `<select>`（`git grep -n "<select" -- components app` 確認）。

## 已知事實
- `BirthForm` 被紫微、八字、每日運勢、合婚頁共用；合婚用它的 `onChange`（批 1 H1 加的，`onSubmit` 為選用）。
- 塔羅頁的牌陣／主題按鈕（`components/TarotTool.tsx`）是既有的按鈕寫法，class 沿用同一套。

## 要做的
1. 三個 `<select>` 改成按鈕群（單選；選中的用既有的 active 樣式；`aria-pressed`）。城市按鈕選了就帶入經度，經度欄位仍可手改。
2. 表單送出的值、`onChange`／`onSubmit` 的資料形狀逐欄不變。

## 檔案
`components/BirthForm.tsx`；需要新 class 才動 `app/globals.css`（用既有 CSS 變數，不寫色碼）。

## 既有資料
無儲存資料。四個使用頁行為不變。

## 測試
不新增單元測試。`npx tsc --noEmit`；`npm run dev` 實際開紫微、八字、每日運勢、合婚四頁各排一次（繁中），英文開一頁；手機寬度（375）看按鈕換行不破版。

## 不要做
不改欄位、不加城市、不動排盤邏輯；不做 S1 的事（`SystemNav`、清單）。
