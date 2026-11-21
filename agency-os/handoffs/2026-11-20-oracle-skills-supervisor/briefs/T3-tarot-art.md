# T3 塔羅牌圖（批 6b；T2 併入後才做）

來源：`D:\tmp\oracle-repos\fzlzjerry_tarot-mcp\assets\cards\*.webp`（78 張＋牌背，512×768，約 6.9MB；`assets/cards/manifest.json` 有雜湊）。授權 `assets/ASSET_LICENSE.md`（MIT，Copyright (c) 2026 Morax；AI 生成；「在著作權存在的範圍內」授權、不保證不侵權）。**不可用**：anois、TarotWhisper 的牌圖。

做：
1. 複製 79 張到 `public/tarot/`，檔名對應本站牌 id（`lib/tarot.ts`）；寫一個測試確認 78 張牌每張都有對應檔案、檔案雜湊與來源 manifest 一致。
2. `components/TarotTool.tsx` 顯示牌圖：未翻開顯示牌背，逆位旋轉 180°；`alt` 用牌名；尺寸固定避免版面跳動；Next 16 的圖片元件用法先讀 `node_modules/next/dist/docs/`。牌圖載入失敗時退回現在的純文字卡。
3. `THIRD_PARTY_NOTICES.md` 加一段：來源、著作權人、MIT、`ASSET_LICENSE.md` 的來源聲明摘要與「AI 生成、不保證不侵權」；`public/tarot/LICENSE.txt` 放原授權檔。
4. 不改牌義、不改牌陣。

檔案：`public/tarot/*`、`components/TarotTool.tsx`、一個測試、`THIRD_PARTY_NOTICES.md`、`messages/*.json`（如需）。
