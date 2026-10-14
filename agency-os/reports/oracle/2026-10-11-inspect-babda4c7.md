# codex-oracle inspect -- 2026-10-11 00:33:49 +08:00

- mode: `inspect`
- scope: whole repo
- target: `working tree (staged + unstaged + untracked)`
- context: (none given)
- exit: 0 | elapsed: 405547ms | answer: 4848B
- files-reviewed: (n/a for this mode)
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

先說限制：`D:\tmp\supervisor-v61.html` 不在目前可讀範圍。我核對的是 repo 內可讀副本；監工台引用均指該副本。

### 1. 哪裡怪

- **CONFIRMED：網站入口和產品正本互相打架。** 正本說方法目錄、工作流、結果頁退到積木裡（`platform-supervisor.html:685`）；實際首頁仍列工具分類、熱門工具和「開始」按鈕（`apps/cognitive-web/app/(shell)/page.tsx:20-59`），主選單也仍把「工具」「工作流」列成頂層（`AppNav.tsx:21-22`）。第一次想處理一件事的人，會先被送去挑工具，不會先進「我的案子」。

- **CONFIRMED：把使用者身分和工作意圖疊成兩層入口。** 「治療師／自己做事」是角色；「有一件事／用某方法」是意圖。角色先分流會造成重複路徑。治療師也可能替自己做企劃，創業者也可能帶團體；目前程式已把專案、群組、帶領分成並列區域（`AppNav.tsx:15-25`），不需要再把人切成互斥族群。

- **CONFIRMED：把套件、工作流、八步循環當成同一種起步式。** 套件實際是積木順序（`assembler.py:10-18`）；工作流是工具／能力的自動執行串（`platform-supervisor.html:649,658`）；八步是跨積木的人類行為循環（`platform-supervisor.html:1449-1462`）。使用者選「自我理解」後得到五塊積木，卻又看到八步，會不知道現在要按「下一塊」還是「下一步」。

- **CONFIRMED：把五樣全程生效項叫成五條規矩。** 程式把它們定義成 `ALWAYS_ON`，包括完整性、脈絡、組裝器、協作合約、紀錄（`blocks.py:13-17`）；正本也明說它們「不算積木」，是管工具怎麼被用（`platform-supervisor.html:672-673`）。它們應是側邊的運作條件，不應和十四塊並列成房間。

最可能讓她覺得怪的核心是：**一個畫面同時在講角色、入口、工作容器、執行模式、產品地圖和學習循環。**

### 2. 七樣是否同層

不是。

- 兩群人：角色與權限視角。
- 兩道門：進入意圖。
- 案子：真正的工作容器。
- 十四塊：使用者工作的穩定區域。
- 工具：積木內可選的方法。
- 套件：積木順序的預設組合。
- 八步：跨積木的行為與學習視圖。
- 工作流：另一種「AI 一次跑完」的自動模式，不是套件。
- 五樣全程生效：系統側欄，不是使用者房間。
- 工程工具：存在，但不給一般使用者看（`blocks.py:15-16,31`）。

### 3. 兩道門能否並存

能。

正確說法是：

> 「我有一件事」會建立案子。  
> 「我要用某個方法」會先開方法說明，再選擇放進既有案子，或做一次方法練習。

所以「工具不是入口」應改成：

> 工具不是網站的主導航，也不是工作的容器；方法可以是開始方式，但執行結果一定落進案子或方法紀錄。

### 4. 最乾淨的結構

```text
開始
├─ 我有一件事 → 我的案子
└─ 我要用某個方法 → 方法卡
                         ├─ 放進既有案子
                         └─ 單次方法練習

案子
└─ 路線：套件預設積木順序 → 你同意後增減積木 → 每塊內挑工具
   上方：八步循環，顯示你目前的思考動作
   側邊：五樣全程生效項，顯示系統一直管什麼
   另列：工作流，標成「自動跑完」，不冒充套件

角色是視角，不是分叉產品：
自己做事的人看到自己的案子；
治療師看到群組、帶領中的案子與可見範圍。
```

第一次進來只看到兩道門和一個例子。第二次進來先看到「我的案子」和待回顧位置。治療師先看到「帶領中的群組」，但進入的仍是同一套案子、積木和紀錄。

### 5. 數字查證

- **20：數字對，分類錯。** 7 套件加 13 條 user 工作流。
- **13：對。** 目前給人的工作流是 13 條。
- **233：對。** 一般積木內的方法數。
- **10：對。** `jurisdiction` 映到 `CONTEXT`（`blocks.py:30`）。
- **43：對。** 工程類內部工具（`blocks.py:31`）。
- **14：對。** `BLOCKS` 明列十四塊（`blocks.py:12`）。
- **5：數字對，名稱錯。** 是五樣全程生效項，不是五條規矩。
- **7：對。** `PACKAGES` 有七個套件（`assembler.py:11-18`）。
- **8：對。** `LOOP` 有八步（`platform-supervisor.html:1449-1458`）。

補充：現況不是 16 條工作流，而是 **13 條 user＋4 條 internal＝17 條**（`recipe-display-metadata.yaml:10-26`；載入器會納入所有 ACTIVE recipe，`display_catalog.py:175-201`）。工具數的 285 也已過時；registry 有 287 筆，其中一筆是非工具的 perspective，實際工具是 286（`method_resolver.py:48-55`；`display_catalog.py:115-133`）。
