# 認知主權平台：入口與文件地圖

- 日期：2026-10-11
- 用途：說明平台今天的問題、首頁入口應該長什麼樣，以及想了解整個平台要讀哪些檔案。

---

## 1. 問題

1. **平台給人的體驗，跟妳要的平台不一樣。** 妳要的第二版是「AI 訓練人自己思考」，藍圖和監工台都寫好了。但一個人打開網站，經歷的是第一版：挑工具、AI 給分析。第二版做好了，卻藏在後面。
2. **第一次來的人看不懂這是什麼、該怎麼用。** 進來沒有一個清楚的起點，也沒有一條路告訴他先做什麼、再做什麼。
3. **妳手上的東西很多，卻沒有被組成一個有邏輯的整體。** 兩群人、兩道門、17 條工作流、286 個工具、14＋5 塊積木、八步循環、7 個套件，每一樣都有，但彼此是什麼關係，網站上看不出來。連妳自己看了都搞不清楚，使用者更不可能懂。

### 第一次使用者實際走的路（2026-10-11 用全新帳號在本機走過）

| 步驟 | 發生什麼 |
|---|---|
| 登入 | 要填「Tenant ID」，是一串系統編號，一般人不可能知道。網站名稱寫英文「Cognitive OS」。 |
| 首頁 | 只有第一版：「先說你卡在哪」和工具目錄。輸入「合夥人第三次改合約，要不要繼續」，推薦了 ZOPA、獨立裁決、變更風險矩陣；最後一個是工程工具。 |
| 想走第二版 | 沒有按鈕可以直接開案子。唯一的路：先跑一個工具 → 系統開一個以工具命名的專案 → 進專案 → 找到「開案資料 →」才開始。 |
| 進了案子 | 第二版是做好的：選目的、推薦套件、可重排；每一塊先問 AI 能做什麼；外化卡片、情緒強度、AI 當鏡子都在。 |
| 帶領 | 走不通。帶領者課程三堂都是草稿，也沒有審過的帶領稿，所以還不能帶個案。 |

---

## 2. 首頁入口

首頁只問一句：**你今天想用哪種方式開始？** 下面兩顆按鈕：

| 按鈕 | 給誰 | 按下去 |
|---|---|---|
| **直接分析** | 趕時間、只需要一個答案的人 | 進工具目錄：12 類問句、搜尋、13 條工作流。選一個方法，填格子，AI 分析，直接給結果。結果之後可以放進案子裡繼續想。 |
| **陪我思考** | 想把一件事真正想清楚的人 | 直接進「開案」：選目的，系統排好積木順序，從第一塊開始。你先寫，AI 再補充、提問、找反例；結論由你自己下。不需要先跑工具。 |

- 「直接分析」是第一版：工具產生分析結果給人用。
- 「陪我思考」是第二版：AI 訓練人自己思考。
- 兩邊用同一批工具。AI 做出來的東西可以帶進案子當材料，標「AI 做的」，永遠不會自動變成你的判斷。

---

## 3. 兩個系統的關係

```
第一版（舊系統）              第二版（新平台）
工具庫＋AI 分析         →     AI 陪人練判斷
286 個工具、17 條工作流        14＋5 塊積木、7 個套件、八步循環
            同一批工具，第二版把工具放進積木裡用
```

### 工具怎麼處理

| 工具 | 「直接分析」 | 「陪我思考」的案子裡 |
|---|---|---|
| 一般工具 233 個 | 照今天的做法：選工具、填格子、AI 分析、出結果 | 放在它歸屬的那一塊裡挑：外化 16（藝術反思）、拆解 116、共思考 32、查證 11、計算 11、判斷 14、行動 22、回顧 11 |
| 法規 10 個 | 同上 | 放在「規範與脈絡」 |
| 工程 43 個 | 不給一般人看，只給內部和工程客戶 | 不出現 |
| 工作流 13 條（另 4 條內部用） | 照今天：AI 一口氣跑完 | 每一塊有「沒時間，叫 AI 直接跑」 |

今天的落差：跑一次工具就開一個新專案；案子裡只有「拆解」能挑工具；工程工具照樣出現在一般人的推薦和目錄裡。

---

## 4. 想了解整個平台，要讀哪些檔案

### 妳要看的（照這個順序）

| # | 檔案 | 看了知道什麼 |
|---|---|---|
| 1 | [監工台](https://claude.ai/artifact/E8VKViRmycqsXySHdnhUSJ) | 全貌：14＋5 塊、地圖、八步循環、7 個套件；「現有工具去哪」那一頁講舊工具歸到哪一塊 |
| 2 | [藍圖 v0.7](BLUEPRINT_v0.7.md) | 第二版要做什麼、不做什麼、核心原則 |
| 3 | [判斷主權教育架構 v0.1](JUDGMENT_SOVEREIGNTY_EDUCATION_ARCHITECTURE_v0.1.md) | 妳的理論：判斷主權、八步循環、五個介面問題 |
| 4 | [舊系統總計畫](../../docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md) | 第一版要做什麼 |
| 5 | [方法地圖](../../docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md) | 286 個工具怎麼分類、怎麼組 |
| 6 | [畫面樣稿](../../../Projects/internal/cognitive-engineering-os/docs/mockups/home-mock.html) | 第一版今天的長相：首頁、結果頁、課程頁 |

### 工程師要再看的

| 想知道 | 檔案 |
|---|---|
| 第二版跟藍圖哪裡不同 | [增補](BLUEPRINT_ADDENDUM_2026-10-02.md) |
| 兩版怎麼接：工具歸哪一塊 | [blocks.py](../../../Projects/internal/cognitive-engineering-os/ai_lego/core/domain/blocks.py) |
| 7 種目的和套件 | [assembler.py](../../../Projects/internal/cognitive-engineering-os/ai_lego/core/domain/kinds/assembler.py) |
| 工具、12 類問句、工作流的清單 | [method-inventory.yaml](../../docs/AI_LEGO_Cognitive_Engineering_OS/methods/registry/method-inventory.yaml)、[method-goal-groups.yaml](../../docs/AI_LEGO_Cognitive_Engineering_OS/methods/registry/method-goal-groups.yaml)、[recipe-display-metadata.yaml](../../docs/AI_LEGO_Cognitive_Engineering_OS/recipes/registry/recipe-display-metadata.yaml) |
| 第二版做到哪、還沒做什麼 | [STEP1_CHECKLIST.md](../../../Projects/internal/cognitive-engineering-os/docs/platform/STEP1_CHECKLIST.md)、[STEP34_CHECKLIST.md](../../../Projects/internal/cognitive-engineering-os/docs/platform/STEP34_CHECKLIST.md)（看 NOT YET） |
| 第一版結果頁缺什麼 | [RESULT_PAGE_GAP_REPORT.md](../../../Projects/internal/cognitive-engineering-os/docs/RESULT_PAGE_GAP_REPORT.md) |
| 第一版的規則和階段 | [Program Plan](../../docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_OS_Program_Plan_v1.md)、[Execution Contract](../../docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md)、[Architecture Constitution](../../docs/AI_LEGO_Cognitive_Engineering_OS/Architecture-Constitution-v1.md) |
| 網站選單 | [AppNav.tsx](../../../Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/AppNav.tsx) |
| 哪些 AI 按鈕可以改成程式 | [AI_TO_CODE_AUDIT.md](../../../Projects/internal/cognitive-engineering-os/docs/platform/AI_TO_CODE_AUDIT.md) |
| 會員、登入、點數怎麼接 WordPress | [ADR 015](../../docs/architecture/decisions/015-awarewave-account-and-shared-wallet.md)（承接 [ADR 012](../../docs/architecture/decisions/012-shared-platform-layer.md) 共用帳本） |
| 怎麼部署上線 | [GO_LIVE.md](../../../Projects/internal/cognitive-engineering-os/docs/platform/GO_LIVE.md) |
