# Vibe Coding 與 Agentic Engineering 完美執行手冊

> **為 ADHD + ASD + OCD + HSP + C-PTSD + 紫微斗數帝王級疾厄宮 完整客製**
>
> **這份文件的存在目的是減少痛苦，不是要達成的標準。**
> 任何時候用不到、跑不動、想跳過——都不是 fail。它是解套工具 (relief tool)，不是工作流 spec。
> 副產品（不是目的）：在 vibe coding / agentic engineering 工作流下穩定產出。
>
> 特別解決三大核心痛點：**記憶**（飛散金探子）/ **時間軸**（碎片式）/ **注意力散失**（跨 session 失焦）。
>
> *2026-05-22 by user × Claude 共同建構*

---



---

## 第一部：五重特質的痛點，對 vibe coding 的具體影響

### ADHD 痛點


| 痛點                                  | 對 vibe coding 的影響                        |
| ----------------------------------- | ---------------------------------------- |
| Working memory ~2 個 active context  | 同時 2-3 個 session 就互相忘掉                   |
| **無內在時間軸**                          | 不知道 task 多久、deadline 抽象、看不到 elapsed time |
| Hyperfocus 失控                       | 一坐 8 小時，crash 後 1-2 天無法工作                |
| Task initiation paralysis           | 知道要做但啟動不了                                |
| Novelty seeking                     | 開新坑棄舊坑，TASKS.md 累積爛尾                     |
| Decision fatigue                    | 工具/路徑選擇就燒掉執行能量                           |
| RSD (rejection sensitive dysphoria) | Code review / agent 反問觸發過度反應             |


### ASD 痛點


| 痛點                     | 對 vibe coding 的影響                |
| ---------------------- | -------------------------------- |
| Sensory overload       | Error log 紅字、太多 tab、通知聲 = 工作能力下降 |
| 需要可預測性                 | 工具/流程改動 = 重新校準成本                 |
| Task switching cost 高  | 被打斷 = 30-60 分鐘才能 re-enter        |
| 過度系統化                  | 容易在 meta-system 上 yak shave      |
| Literal interpretation | 模糊規格 → 卡住、做錯                     |


### OCD 痛點


| 痛點              | 對 vibe coding 的影響           |
| --------------- | --------------------------- |
| Verification 強迫 | Agent 輸出無限 re-check，無法 ship |
| 「夠了」訊號缺失        | 沒有客觀停止條件就會循環                |
| 完美主義癱瘓          | 寧可不做也不要做不好                  |
| 焦慮驅動            | 「萬一沒測到」變成行動主軸               |


### HSP 痛點


| 痛點                    | 對 vibe coding 的影響    |
| --------------------- | -------------------- |
| 深處理 (deep processing) | 每個輸入要花更多腦袋能量處理       |
| Sensory overload      | 跟 ASD 疊加 = 更快疲勞      |
| Emotional flooding    | Agent 語氣稍微「不對」就影響整天  |
| 恢復時間長                 | Burnout 後恢復是別人 3-5 倍 |


### C-PTSD 痛點


| 痛點                          | 對 vibe coding 的影響               |
| --------------------------- | ------------------------------- |
| Hypervigilance              | 持續 scan 威脅 = 持續耗能               |
| Window of tolerance 對侵入性刺激窄 | Deadline / criticism / 被催 = 出窗口 |
| Freeze response             | 重要時刻僵住                          |
| 對命令的反應                      | 任何「應該」「必須」觸發抗拒                  |
| Shame spiral                | 一個小失敗 → 自我攻擊鏈                   |


### 特有的微觀痛點（從生活觀察出來、不在標準清單但日常高頻）

這些不完全 map 到上面五個特質的教科書清單，但**日常頻繁觸發、對 vibe coding / agentic engineering 工作流設計影響大**。

#### 1. Task chaining failure（連續性斷裂）

**典型場景**：店長要我擺設餐具，我擺了——但後續一連串該做的事（收檯面、補餐具、reset）就停了。被點出後會改進，但**機制本身仍在**，只是要有人提醒才接得上下一步。

**機制**：ADHD working memory ~2 個 active context + executive function（執行功能）弱 → 完成一步後沒主動 prompt 自己 next step，**stack 直接清空**。不是懶、不是忘——是「下一步」這個訊號**根本沒生成**。

**對 vibe coding / agentic engineering 的設計意涵**：
- Agent 必須**主動產生 next step prompt**，不能等你問
- TodoWrite 不能只列「擺餐具」這種**單動作粒度 (single-action granularity)**，要列「擺餐具 → 收檯面 → 補餐具 → reset」整個 **action sequence**
- Claude 完成一個動作後**主動問**「下一個是 X，要繼續嗎？」，不能等你自己想下一步
- 「完成感」要綁在**序列完成**，不是綁在**單步完成**——不然你會在第 1 步就感到完成、然後停（你以前打工就是這個機制）

#### 2. Familiarity-recollection dissociation（似曾相識感過載）

**典型場景**：出去玩常覺得「這地方我好像來過」，但其實只是街景類似。

**機制**：**Familiarity（熟悉感）信號保留，但 recollection（具體回憶）路徑失效** → false positive（假陽性）高。這是議題 1 context binding failure 的另一個證據——能感覺「有」，但綁不到「是什麼」。

**對 vibe coding / agentic engineering 的設計意涵**：
- 看到 agent 輸出「這個我好像處理過」**不要相信自己的 familiarity 信號**，強制讓 Claude grep WORKLOG / git log 確認
- 程式碼也一樣——「這段我好像寫過」要 grep / search 才能確認，不能只憑感覺
- **反向利用**：這個機制其實**保護你避免 OCD verification loop**——熟悉感本身不算驗證，必須有**外部 binding 證據**（grep 結果、Claude 撈到的 WORKLOG entry）才算驗證過。**這給 OCD 的「夠了」訊號一個客觀錨點**

#### 3. Topographical disorientation（方向反向 99.9%）

**典型場景**：找路 99.999% 走相反方向，看著 Google Map 都會走反，有時很久才發現。

**機制**：ASD + ADHD 共病常見。Spatial mental rotation（空間心理旋轉）+ working memory 過載 → 把左/右、north/south 反向 binding。本質是 **spatial binding failure**（空間綁定失效），跟議題 1 的 context binding 同一個根。

**對 vibe coding / agentic engineering 的設計意涵**：
- **物理空間 anchor 不可靠** → WORKLOG「地」欄寫得到就寫、寫不到不要逼自己想
- **數位空間 anchor 可靠** → Peacock 顏色、檔案 path、git branch 名、檔名比物理位置強 100×
- Agent 給指令時**避免相對方向**（「往左 / 上方 / 旁邊的」），用**絕對 identifier**（檔案 path、行號、symbol 名）
- UI / 流程設計上，**spatial reasoning 該外包給 agent**，不要寫成需要你導航的流程

#### 共通根源：所有這些痛點都是 binding failure 的不同表現

| 痛點 | binding 類型 |
|------|------------|
| 議題 1 的飛散金探子 | **context binding**（事件 ↔ 人物地時） |
| Task chaining failure | **action sequence binding**（這個動作 ↔ 下個動作） |
| 似曾相識感過載 | **familiarity-recollection binding**（感覺 ↔ 具體記憶） |
| 方向反向 | **spatial binding**（位置 ↔ 方位） |

→ **這給整個手冊一個 unified 解釋框架 (unified framework)**：你需要的所有解法，本質上都是**「把 binding 外包給外部系統」**。
→ Agent / WORKLOG / Claude 1M context 不是「輔助工具」，是**你大腦做不到的 binding 的義肢 (prosthesis)**。
→ 這個 framework 也定義了**什麼是好的工具設計、什麼是壞的工具設計**：好工具替你做 binding；壞工具假設你會自己 binding。

### 條件互動（這才是日常真正的戰場）


| 內戰                | 體驗                                     |
| ----------------- | -------------------------------------- |
| ADHD ↔ OCD        | 想跳走 vs 想完美 → 多個半完成的 perfectionism loop |
| ADHD ↔ ASD        | 要新鮮 vs 要可預測 → 蓋結構再改、永不滿意               |
| OCD ↔ vibe coding | 「交給 agent」vs「必須親驗」→ 接受輸出時內在焦慮          |
| ASD + HSP ↔ 工具量   | 工具多 = sensory overload = 腦袋淹           |
| **C-PTSD ↔ 所有其他** | **觸發 = window 關閉 = 其他適應策略同時失效（地基規則）**  |


---

## 核心 Framework：Binding-Failure-First Design Philosophy

> 這節是手冊的**中軸**——解釋**為什麼**後面所有解法（第三、第四部）是這樣設計，而不是傳統工作流的設計。
> 一句話濃縮：**你需要的所有解法，本質上都是「把 binding 外包給外部系統」**。
> 如果未來 session Claude 只能讀一節，讀這節。

### A. 好工具 vs 壞工具的判準

對你來說，工具的價值**不**取決於「功能多寡」「整合度」「美觀度」——取決於**它替你做哪一種 binding**。

| 維度 | 好工具（替你做 binding） | 壞工具（假設你會自己 binding） |
|------|----------------------|-------------------------|
| 記憶 | 語意搜尋 (semantic search)、自動 cross-reference | 要你建分類、記 tag |
| 序列 | 完成一步自動產生 next step | 列被動 todo list 等你接 |
| 空間 | 絕對 identifier（path / line / symbol） | 相對方向（往左 / 上方 / 旁邊那個） |
| 持久化 | 自動 anchor metadata | 要你手動加 metadata |
| Context | 大池子 + semantic query | 要你手動分檔分目錄 |
| 決策 | Agent 提候選、你只挑 | 要你 routing 接續 |

→ **實用判準**：裝任何 extension / 訂閱任何 SaaS / 採用任何 framework 之前問一句：「**這替我做哪一種 binding？**」答不出來 = 對你價值低，可能還是負擔。

### B. Agent prompting 預設值（寫進 CLAUDE.md / system prompt）

每個 Claude session 該內嵌四條預設行為——不靠你當下記得提，靠系統強制：

1. **完成動作後主動產生 next step prompt** —— 治 task chaining failure。
   - 例：「擺餐具完成 → 下一步是收檯面 → 要繼續嗎？」
   - 不是被動等你問下一步。
2. **Retrieval 預設用外部 grep / semantic search，不信 user familiarity 信號** —— 治似曾相識過載。
   - 你說「我好像寫過這個」→ Claude 自動 grep 確認，不直接相信。
3. **空間/方向指令用絕對 identifier**（檔案 path + line number / symbol 名）—— 治方向反向。
   - 不用「往左 / 上方 / 旁邊那個」。
4. **Metadata 強制 5 維 anchor combination**（時間 / 人 / 地 / 物 / 感官）—— 治 context binding failure。
   - 不用單一 tag。

→ 這四條應該變成一個 user-level CLAUDE.md 段落，每個 Claude session 自動繼承。

### C. Workflow 拓樸 (topology)：不是 pipeline，是 persistent state + agent-driven traversal

傳統工作流設計：**linear pipeline**（A → B → C → D），使用者在每個節點做 routing 決策。

對你不對——**routing 本身就是 binding**，你做不到。Pipeline 設計把高摩擦的「決策接續」推給你，你會在某個節點停（就像擺餐具完成後停）。

對你的設計：
- **你的角色**：① 持續往池子裡丟 raw context（WORKLOG / INBOX / INBOX-triggers / decisions）② 用自然語言 query
- **Agent 的角色**：所有 binding（時間 / 序列 / 空間 / context / 路徑決策）
- **中間沒有 routing 節點交給你**——routing 也是 agent 的事

→ 解釋為什麼傳統 PM 工具（Jira / Trello / Linear）對你都怪——它們預設你能 routing。對你 work 的是「**一個大池子 + agent 撈**」。

### D. 神經配置從劣勢變優勢的真正機制

這是這個 framework 給你最積極的一條：

| | 傳統 workflow | Agentic workflow |
|---|-------------|-----------------|
| 獎勵的行為 | 整理、分類、接續、routing | 丟得多、丟得快、語意豐富 |
| 你的天然行為 | **失分** | **得分** |
| 累積資產 | 你整理出來的 doc / index | **raw context pool 本身** |
| 年資越久 | 整理負擔越大 | retrieval 質量越高 |

**關鍵洞察**：因為 binding 全部外包給 agent，你**不需要花時間整理舊資料**。raw context 累積本身就是資產，agent 替你做 retrieval。

→ 這跟下節紫微斗數段「武曲祿在疾厄、貪狼權在子女」說的是同一件事——只是換成神經科學語言：**你的神經配置不是負擔，是配對到對的工具範式才生效**。Agentic engineering 就是那個範式。

### E. Adult-to-Adult 互動模式是 binding system 的運作前提

這條看似跟 binding framework 無關，實質深度連動：

**機制鏈**：階級式語言（「你應該」「你必須」「臣建議」）→ C-PTSD 對命令的反應 → freeze response（凍結反應） → working memory 暫停 → **所有 binding 機制當機**。

→ Adult-to-Adult 互動模式**不是「禮儀偏好」**，是**整個 binding system 持續運作的前提**。
→ Agent 用階級式語言 = 直接打掉你的執行能力 = 不是「不舒服」而已，是**讓所有 protocol 失效**。
→ 反過來：Adult-to-Adult 語氣 + 透明選項 + 「你怎麼看」這種句型 → 維持 window of tolerance（耐受窗口） → binding system 可以運作。

句型參考：
- ✅「一個觀察是…」「另一條路是…」「我會建議 A，因為 B；你怎麼看？」
- ❌「你應該…」「你必須…」「太棒了！」（過度奉承也是上對下 dynamic）

### F. 失敗模式 (failure modes) 識別表——5 秒 diagnose + 套 protocol

日常觸發痛點時，你不需要當下判斷該怎麼辦——對照下表 5 秒 diagnose + 套對應 protocol：

| 觸發訊號 | 失敗模式 | 套這個 protocol |
|---------|--------|--------------|
| 「在第 1 步感到完成 → 想停」 | action sequence binding failure | 開 sequence-level TodoWrite、Claude 主動問 next step |
| 「我好像寫過這個」「這個我好像處理過」 | familiarity-recollection dissociation | 強制 grep / semantic search 外部確認，不信感覺 |
| 「走錯方向、看 map 還走反」 | spatial binding failure | 用 path / line number / 絕對 identifier；數位 anchor 取代物理 |
| 「找不到那個對話 / 那個 idea」 | context binding failure | 把模糊 trigger 詞丟給 Claude 從 raw pool 撈 candidates |
| 「想到要做但啟動不了」 | 三類根源 | 先 diagnose ADHD novelty / C-PTSD freeze / ASD 切換阻力（見第三部議題 3 #6） |
| 「verification 跑了還想再跑」 | OCD verification loop + familiarity 不算驗證 | 跑完 R0 [驗證計畫] 四動作 = 夠了，stop |
| 「Agent 用了階級式語氣，我突然當機」 | E. 段機制鏈觸發 | 立刻提醒 agent 切回 Adult-to-Adult；不要硬撐 |

→ 這個表是手冊**日常使用率最高的一頁**——不需要記，需要的時候對照就好。
→ 也是這份手冊「不是 spec、是解套工具」的具體體現：你不需要全部記住，需要時翻到這頁 5 秒 diagnose 就好。

---

## 第二部：紫微斗數 chart 給的優勢與警告

只擷取對 vibe coding / agentic engineering 真正有 implication 的部分，不做過度命理演繹。

### Chart 顯示的天然優勢

**1. 疾厄宮：武曲(旺)[生年祿] + 天府(旺) + 祿存(廟) + 帝旺**

- 體質基底異常強壯——能承受別人承受不了的 hyperfocus 強度
- **武曲祿在疾厄 = 你的神經系統本身就是你的財星**。特殊神經配置不是負擔，是生財工具
- 帝旺 = 生命力處於顛峰狀態
- ⚠️ 警告：再強的體質也禁不起無止盡透支。「能撐」≠「該撐」

**2. 子女宮：貪狼[生年權] + 火星**

- 創造力與學習力天生帶權，配 火星 = 爆發性學習力
- Vibe coding / agentic engineering = 新領域 + 高創意 + 高學習 → 完美命中

**3. 身宮在夫妻宮：天機[↑科] + 巨門[↓權][↑忌] + 鈴星**

- 身宮 = 成年後自我構建的場域；落在夫妻宮 = 透過**深度配對 (partnership)** 構建 identity
- 你跟 AI/agent 的深度合作關係，**字面上就是身宮主題的活動**——不是巧合
- 天機 + 巨門 = 智慧 + 質問，異常適合 prompt engineering / agent dialogue

**4. 生年四化分布**

- 武曲祿（疾厄）+ 貪狼權（子女）+ 天梁科（命）
- = 「**用身體深度沉浸的創意 / 學習活動帶來名與利**」的配置
- 文曲忌（事業）= 事業天生帶藝術 / 表達的阻礙——**傳統職涯路徑會卡，非傳統路徑反而通**
- Vibe coding 是非傳統路徑

### Chart 顯示的警告

**1. 命宮：天梁陷 + 文昌 + 十二長生「絕」**

- 天梁是顧問/長輩/分析星，陷在命宮 = 天生想做「智者/分析者」角色但這位置吃力
- - 文昌 = 文書/思辨強，但會「想太多」
- 「絕」= 大轉化能量但伴隨頻繁重啟
- ⚠️ Maps onto：你會卡在 analysis paralysis、想把事情想到完美才動手
- **執行原則**：不要試圖在動手前把所有事想清楚——這個位置會讓你越想越卡

**2. 事業宮：文曲[生年忌] + 大限巨門忌（雙忌）**

- 事業 + communication / 表達 一直有阻力
- ⚠️ 警告：**傳統「跟人合作 / 公開表達 / 解釋自己工作」會比別人累很多**
- Agentic engineering 大幅降低社交摩擦這部分，但**對外界呈現你的工作**仍會是長期難題
- **執行原則**：把「執行」跟「呈現」分開做，呈現部分用 agent 大量輔助

**3. 命主巨門 + 身主天相**

- 巨門：質問 / 挖掘 / 懷疑 → 自然陷入 OCD 式驗證循環
- 天相：服務 / 輔助 / 結構 → 自然過度負責、收拾別人爛攤子
- ⚠️ 警告：你會接過不該接的工作（天相），然後質問自己做得夠不夠好（巨門）= 雙重耗能
- **執行原則**：每次答應接案/任務前停一拍：「這是天相在自動接，還是我真的想做？」

**4. 福德宮無主星**

- 內在 / 精神生活主軸是借來的（從財帛宮太陽+太陰）
- = 精神狀態跟價值感 / 資源感**高度耦合**
- ⚠️ 警告：經濟壓力會直接打擊到 mental state，比一般人嚴重
- **執行原則**：vibe coding 的不穩定收入結構對你風險高，**收入緩衝 (runway) 是 mental health infrastructure 的一部分**

---

## 第三部：三大核心痛點的深度解法（**最重要的一段**）

### 議題 1：記憶（飛散金探子 + 無 index）

**根本機制**：這不是 retrieval failure，是 **context binding failure**（情境綁定失效）。Episodic memory（情節記憶）有兩層：① 事件 gist（要點/輪廓）② context binding（把事件綁到 who/what/where/when）。你的情況是**第一層保留、第二層斷裂**——「隱約記得發生過」但不記得人/物/地/時。學術上叫 **temporal context binding deficit**（時序情境綁定缺陷），跟海馬迴 (hippocampus) binding function 弱化有關；C-PTSD 解離型記憶 (dissociative memory) 會疊加。

實際運作：中央一團「發生過」的霧，周圍是 free-floating 的 anchors（人/物/地/時）飄在外面，**中間的線斷了**。Retrieval 路徑只剩 associative（聯想式），沒有 categorical（分類式）。觸發到 = 整段湧現；沒觸發 = 完全不存在。

**核心設計原則（這條主導所有解法）**：
這份手冊的記憶系統**不靠分類、不靠你建 index**，靠**外包 binding 給語意搜尋 (semantic search) + 多維 anchor**。

- 你的大腦做不到 binding（海馬迴硬體限制）→ 不要試圖強化它
- Claude 1M context 在 attention 機制裡做你做不到的 binding → 把它當 hippocampus extension
- 你的角色定位是 **source**（餵 raw context 進去），不是 **archivist**（建 index）或 **indexer**（分類）
- **索引者悖論 (indexer's paradox)**：要建 index 必須先分類，但你的腦袋抗拒分類 → 你建的 index 對自己沒用 → 別建

**七個具體解法**（都是上面原則的具體實作）：

1. **問 Claude 取代逼自己想** —— 當你「覺得好像有」時，第一動作不是逼想，是把模糊觸發詞丟給 Claude 做 semantic search。逼自己想 = 30 分鐘 + 沮喪；問 Claude = 5 秒。變成肌肉記憶。
2. **WORKLOG 寫成「未來的觸發點」，不是「過去的記錄」** —— 每個 entry 想：「6 個月後我會怎麼搜到這個？」包含情緒 tag、感官描述、當時在意的事、**自己試錯的具體場景**（你記得自己的錯誤勝過正確）。
3. **INBOX.md 機制** —— 任何臨時 idea 一行扔進去，零摩擦、**不分類**（你本來就不靠分類 retrieve）。週日 review 一次。
4. **Zettelkasten 風格雙向連結**（Obsidian / Logseq）—— 每個 note 連到 5+ 個其他 note 建觸發網絡。Tag 用感覺 / 場景 / 顏色 / 心情，**不用主題**。「金探子比喻的那天」比「2026-05-22 ADHD 討論」好搜。
5. **Claude 1M context = 海馬迴 extension（不是「外部記憶體」這麼平淡）** —— 上面開頭原則的核心實作。把全部 WORKLOG / memory / INBOX 丟進去當一個大池子，用自然語言問 Claude，繞過分類。工作流只有兩件：① 持續往裡丟（低摩擦）② 想搜時自然語言問 Claude 撈 candidates，你 5 秒認領哪個對。中間的「分類 / 索引 / tag」全部 skip。對你價值比對一般人高 10 倍——這不是補強，是**替代**你做不到的 binding。
  - 子實作：另開 `INBOX-triggers.md` 專記「我隱約記得有東西但想不起來」的瞬間（觸發本身比 idea 本身重要 10×，因為觸發是 retrieval anchor）。週日把 trigger 詞丟給 Claude 撈 candidates。
6. **觸發豐富的 metadata 寫進每個檔案頭** —— 不只 title 和 date，寫 mood、energy state、相關人事、當時播什麼音樂、什麼天氣。都是未來的 retrieval triggers。
7. **接受：你不需要「記住」，你需要「能找到」** —— 心態轉換：不要追求記憶力，追求**索引品質**。記憶在那裡，你需要的是更好的搜尋。

### 議題 2：時間軸（碎片式、無內在順序）

**根本機制**：你的內在沒有時間坐標系。「3 天前」「上週」「下個月」對你都是同等抽象的標籤，沒有 felt sense（內在感受）。更精確：這是議題 1「context binding failure」的時間軸版本——事件 gist 還在，但 **temporal binding**（時間綁定）斷裂。

**核心設計原則**：
你的 retrieval 走 **episodic memory**（情節記憶）—— 「那天下雨 + 吃了什麼 + 心情如何」這種包裹式記憶；而工作內容多是 **semantic memory**（語義記憶，對 ADHD 較弱）。
→ 時間軸的錨點**不是日期**，是 **event density**（事件密度）：「那天下雨吃了 X」比「7d ago」對你 retrieval 強 10×。
→ 用 episodic（生活 anchor）拉出 semantic（工作內容），不是反過來。
→ 日期數字是給 Claude 看的（讓它做 binding），生活 anchor 是給你看的（讓你接住觸發）。

**七個具體解法**：

1. **時間必須從外部產物製造出來** —— WORKLOG / Git log / Calendar 不是「工具」，是**你的時間感官的義肢**。把它們當成 sensory organ 的延伸，不是輔助。
2. **敘事型 WORKLOG（取代條列）** —— 用「**因為 / 所以 / 然後**」串成故事。「今天從 A 開始，發現 B 不對。修 B 的時候撞到 C，這讓我意識到 D...」每天早上花 60 秒讀昨天的敘事，**這是重新載入時間軸**。沒讀就開工 = 跟昨天斷裂。
3. **Elapsed time 永遠可見** —— TASKS.md 每條後面加 `(5d old, last touch 2d ago)`；PR 標題前綴 `[stale-18d]`；branch 顯示最後 commit days；AO-RESUME 七段式第一段寫「距離上次 close: 14h；距離上週同時: 7d」。每個數字是你沒有的時間感的外部替代。
4. **空間—時間耦合** —— 你的空間記憶通常是好的，用空間 outsource 時間：
  - Peacock extension：每 project 一色（VSCode chrome 染色）
  - 不同目錄結構代表階段（active / stale / archived）
  - WORKLOG 按月切檔（`WORKLOG-2026-05.md`）—— 舊月份的存在感變空間
  - 物理筆記本一季換一本
5. **週日時間軸重建儀式（30 分鐘）** —— 把本週 WORKLOG / git log / Calendar / Slack 丟給 Claude。請它重構敘事：「本週發生了什麼故事？」你 review、修正、補充，產出 200 字「本週故事」存進 `memory/weekly/`。**這個儀式真正功能：讓散亂金探子被動接收一個時間軸並認領它**。一週一次，時間軸會回流到你的長期感覺裡。
6. **TodoWrite 是你的微型時間軸** —— 即使 3 步驟也用。它是你切 tab 回來 5 秒內 re-enter 的入口。不要省略——你會省略，然後切回來空白。
7. **規畫產出是「決策」不是「步驟」** —— `decisions.md`（為什麼選 A、什麼條件下放棄）vs `todo.md`（執行細節）。未來忘記為什麼這樣做時，decisions.md 救你；單純 todo list 救不了。對你比對一般人重要 10 倍。
8. **生活 anchor 強制注入每個 WORKLOG entry（event density timeline）** —— 比 #2 敘事體更低門檻、更耐崩的版本。詳細 template 見 4.1 Setup「WORKLOG binding template」。
  - 為什麼前綴強制：你大腦不做 binding，這個格式就是**外部海馬迴**
  - 為什麼比敘事體耐崩：填欄位 < 寫敘事 5× 啟動成本，burnout 天也填得動
  - 為什麼有效：未來 retrieval 不靠日期，靠「啊那天下雨吃了 X 那天」拉出工作內容
  - **這條優先於 #2 敘事體**——崩的時候只跑這個，不要跑敘事

### 議題 3：注意力散失（跨 session 失焦、模式切換）

**根本機制**：ADHD working memory ~2 個 + ASD task switching 成本高 + HSP 對打擾敏感 + OCD 想完成未完成的事 + C-PTSD 對切換有威脅感 = **五個機制共同放大「切換」的代價**。

**七個具體解法**：

1. **一個 active task = 一個 VSCode window** —— 不在同一 window multiplex。Window 本身的存在/不存在就是任務狀態錨。**關掉 window = 物理收工儀式**（你沒有內在收工感，要靠物理動作製造）。
2. **Session intent declaration** —— 每個新 session 第一句宣告：`@mode BUILD - 90min - soulful plugin auto-update finish`。Claude 攔截違規切換：「你在 BUILD soulful，剛要求是 INFRA。建議：(a) 丟 INBOX (b) 結束開新 session (c) 明確 break mode 並說明原因」。執行功能外包給 agent。
3. `**.agency-state/active-sessions.json` 跨 session manifest** —— 每個 Claude session 啟動寫入 `{session_id, task_id, intent, started_at, last_activity}`。AO-RESUME hook 讀它，告訴你「你現在有 3 個 active session：A 在做 X (idle 4h)、B 在做 Y、C 是新的。你現在是哪個？」
4. **Inter-session handoff packet** —— 離開 session 前強制寫三行：`[剛做完] / [下一步] / [卡點]`。寫進 `.agency-state/last-handoff-{session-id}.md`。回來時 Claude 第一件事讀它。
5. **Inbox 機制阻止 idea 污染當前焦點** —— 任何 idea 一秒扔 `INBOX.md`。規則：扔進去 = 從現在腦袋清除。Trust the file, not yourself。
6. **「啟動不了」先診斷再行動** —— 三類不同根源：

  | 根源            | 內在感覺        | 對策                                     |
  | ------------- | ----------- | -------------------------------------- |
  | ADHD 啟動失敗     | 無聊、找不到 hook | Novelty 拉動（換場景、音樂）                     |
  | C-PTSD freeze | 胃緊、想逃、莫名抗拒  | **先安全感**。問「我在怕什麼？」做最小最安全的一步            |
  | ASD 切換阻力      | 還想做剛剛那件事    | **接受切換需要時間**，5-10 分鐘 transition ritual |

   **搞錯類型會更糟**——對 freeze 用 novelty 解法會觸發更深 freeze。
7. **Sensory budget management** —— 通知全關 / 一次一個 window / 極簡 IDE theme / Audio = 白噪音或固定 lo-fi loop (ASD 喜重複、HSP 不要歌詞) / Error log 先請 Claude summarize 再讀。

---

## 第四部：完美執行的具體 Protocol

### 4.1 Setup（一次性建置）

**VSCode 環境**：

- 裝 Peacock extension，每 project 一色
- 自訂 `window.title` 顯示 `${gitBranch} · ${rootName}`
- 極簡 theme（避免高對比、避免太多 syntax 顏色）
- 通知全關
- Audio loop（白噪音或固定 lo-fi）

**Repo / Workspace 結構**：

- `INBOX.md` — idea 收納（零摩擦、不分類）
- `INBOX-triggers.md` — **觸發本身的收納**（「我隱約記得有東西但想不起來」的瞬間。觸發比 idea 重要 10×，因為觸發是 retrieval anchor）
- `decisions.md` — 決策日誌（為什麼選 A、什麼條件下放棄）
- `WORKLOG.md` — 每日記錄，**強制 binding template 前綴**（見下方）
- `memory/weekly/` — 週故事（週日儀式產出）
- `.agency-state/active-sessions.json` — 跨 session manifest
- `.agency-state/last-handoff-*.md` — session 切換 handoff

**WORKLOG binding template**（每筆 entry 必填前綴 —— **這是你的外部海馬迴**）：

```
時間：YYYY-MM-DD 時段 / 脈絡（剛醒 / 午餐後 / 半夜 / 等等）
人：跟誰 / 哪個 Claude session / 哪個客戶
地：哪個 repo / 哪個資料夾 / 物理空間（如果記得就寫）
物：核心檔案或 artifact（完整 path）
感官：心情 / 能量 / 天氣 / 配樂 / 那天吃了什麼
---
[工作內容 / 敘事（可選，崩的天跳過沒事）]
```

**為什麼這個 template**：

- 你大腦不做 context binding，這個格式就是外部 hippocampus。
- 填欄位 < 寫敘事 5× 啟動成本 —— burnout 天也填得動。
- 5 個維度 anchor 形成 **retrieval combination key**（單獨任一 anchor 命中率 ~5%，組合命中率接近 100%）。
- 「地」欄位有彈性：**數位空間** anchor（path、檔名、Peacock 顏色）✓ 穩定可靠；**物理空間**（哪個房間 / 哪邊的桌） ⚠️ 你的空間記憶不可靠（99.9% 走反方向那個機制），記不起來就跳過、不要逼自己想。
- 未來 retrieval：丟「那天我心情亢奮 + 聽 lo-fi + 跟 Claude 討論的某件事」給 Claude，它會撈到。你不需要記日期。

**User-level CLAUDE.md 加 Adult-to-Adult Protocol**（見章末段）

### 4.2 Daily Flow

**早上（5-10 分鐘）**：

1. 讀昨天 WORKLOG 敘事（60 秒）—— 重新載入時間軸
2. 跑 AO-RESUME，看七段式
3. 宣告今天主 task（`@mode BUILD - 90min - X`）
4. 開對應的 VSCode window（單一 active window）

**工作期間（每 90 分鐘）**：

- 強制中斷一次，做 30 秒 self-check：「我還在做原本的事嗎？」
- 不問「我有沒有偷懶」（避免 C-PTSD trigger），問「方向還對嗎」

**Session 結束**：

- 寫 handoff packet 三行
- 更新 INBOX 裡今天冒出的 idea
- WORKLOG 用敘事體寫今天的故事

**收工**：

- 跑 AO-CLOSE 100% health gate
- 關掉 VSCode window（物理收工儀式）
- 開始 recovery block

### 4.3 Weekly Rhythm

**週日 30 分鐘時間軸重建儀式**：

- 把本週 WORKLOG / git log / calendar / slack 丟給 Claude
- 請它重構敘事
- review、修正、補充
- 200 字「本週故事」存進 `memory/weekly/`

**INBOX triage（同時段）**：

- 跟 Claude 一起 review `INBOX.md`
- 升級成 TASKS / 存進 memory / 刪除

**至少一天 no-work**：

- 完全 zero work-related screen
- 不是滑手機（對 HSP 是繼續消耗）
- 走路、自然、無刺激環境

### 4.4 Recovery Cadence

- Hyperfocus session ≥ 4 小時 = 下一個 calendar block 自動 recovery
- 大型 hyperfocus（8+ 小時）= 排 1-2 天緩衝期，禁止重要工作
- Recovery 寫進 calendar，跟 task **同等優先級**

---

## 第五部：紅線與護欄（絕對不可破）

**會直接擊穿你的事**（避免成本 < 觸發後修復成本）：

1. **接受「規律作息」式建議** —— 對你的神經系統是命令，會觸發抗拒
2. **無 backup 直接動 production / 改 schema / 改 hooks** —— OCD 焦慮會壓垮 hyperfocus 後的判斷
3. **接 hard deadline without buffer** —— 你的時間軸是外部的，buffer 是 mandatory，不是禮貌
4. **公開 demo / 高 stakes 視訊 without rehearsal** —— C-PTSD + RSD 觸發機率高
5. **連續多日 hyperfocus without scheduled recovery** —— 疾厄宮再強也會崩
6. **跟 critical / coach 型管理者長期合作** —— 觸發 C-PTSD freeze 鏈
7. **在 burnout 期間做架構決策 / 改工具鏈** —— 爛決策會綁住你 6-12 個月

**護欄機制（不靠自律，靠系統）**：

- 寫進 hooks（系統強制執行）
- 寫進 CLAUDE.md（agent 提醒）
- 寫進 calendar block（時間結構強制）
- 寫進 INBOX.md / decisions.md（idea 不污染執行）

---

## Plan 狀態

### 2026-05-22 已交付（Binding framework 版）

- **開頭定位重寫**：解套工具 (relief tool) 而不是 spec；「跑不到也不是 fail」保護
- **第一部新節「特有的微觀痛點」**：task chaining failure / familiarity-recollection dissociation / topographical disorientation + 每個痛點的 vibe coding 設計意涵 + binding failure 共通根源
- **新章節「核心 Framework：Binding-Failure-First Design Philosophy」** (L147-243)：
  - A. 工具評估標準（好工具 vs 壞工具的 binding 判準）
  - B. Agent prompting 預設值四條（CLAUDE.md 內嵌）
  - C. Workflow 拓樸 = persistent state + agent-driven traversal
  - D. 神經配置從劣勢變優勢的真正機制
  - E. Adult-to-Adult 是 binding system 運作前提
  - F. 失敗模式 5 秒 diagnose 識別表
- **議題 1**：重寫機制為 context binding failure；加核心設計原則「不靠分類靠語意搜尋 + 多維 anchor」；#5 改寫成 Claude 1M context = 海馬迴 extension + INBOX-triggers 子實作
- **議題 2**：加 temporal binding 機制 + event density 原則；加 #8 生活 anchor 強制注入
- **4.1 Setup**：加 WORKLOG binding template (5 維 anchor 前綴) + INBOX-triggers.md + 數位 vs 物理 anchor 取捨說明

### 下次續做 TASK：設計這個工具

**目標**：把手冊內容轉化成**可執行的具體 implementation**——讓 framework 真的在日常 vibe coding / agentic engineering 工作流裡 work，而不是只停留在文件層次。

#### Tier 1（高優先、低啟動成本，下次第一個碰）

1. **WORKLOG.md 起跑** —— 在某個 active repo 用 4.1 binding template 起一份 WORKLOG，連續用 3-7 天累積真實 data，檢驗實際執行成本 / 效益 / 跑得動 vs 跑不動的天
2. **INBOX 雙檔起跑** —— 建 `INBOX.md`（idea）+ `INBOX-triggers.md`（觸發本身），開始零摩擦扔
3. **B 段四條 Agent prompting 預設值寫進 user-level CLAUDE.md** —— 讓所有 Claude session 自動繼承「主動產生 next step / 外部 grep 確認 / 絕對 identifier / 5 維 anchor」這四條

#### Tier 2（中優先、需要設計決策）

4. **F 段失敗模式識別表的隨手對照機制** —— VSCode snippet vs Obsidian quick-switcher vs 印出來貼牆，三選一
5. **decisions.md 起跑** —— 為什麼選 A、什麼條件下放棄
6. **VSCode setup**：Peacock 每 project 一色 / window.title 顯示 git branch / 極簡 theme / 通知全關 / audio loop
7. **`.agency-state/active-sessions.json` 跨 session manifest** —— schema + 寫入時機 + AO-RESUME hook 怎麼讀（目前手冊提到但 spec 空）

#### Tier 3（未挖議題、留給未來 session 繼續討論）

8. **OCD verification loop 的「夠了」客觀停止條件** —— F 段提了 R0 四動作可當錨點，可擴成完整段
9. **Hyperfocus crash 系統化處理** —— 紅線只說「不要 crash」，沒答「已經 crash 之後怎麼回到軌道」
10. **Deadline 怎麼運作** —— 無時間軸 + 拒絕被命令 + C-PTSD pressure 三重疊加
11. **五個條件「打架」時的 triage 順序** —— 真實日常 80% 痛苦是疊加，目前每個條件單獨講
12. **破戒 / 失敗後的 re-entry ritual** —— 擋 C-PTSD shame spiral 對 protocol 的外溢破壞
13. **學習新東西時怎麼讓金探子留下** —— 學習場景的 binding 設計
14. **與凡人團隊協作時，怎麼讓他們不傷害你的敏感系統** —— Adult-to-Adult 框架在 hierarchical 環境裡的自處策略
15. **Masking 在 agent 互動裡的隱藏成本** —— 為了符合 agent 預期反而消耗
16. **低能量天的 minimum viable protocol** —— burnout 那天該做什麼 minimum 動作不破壞累積

### 下次續做 entry point（給未來 session 的 Claude）

打開這檔，先讀「核心 Framework」（L147-243）建立 baseline，然後說：
> 「上次（2026-05-22）建立了 Binding-Failure-First Design Philosophy framework。這次想動 Tier 1 哪一條 / Tier 2 哪一條 / 或繼續挖 Tier 3 哪個未挖角度？」

**重要**：這份手冊是**解套工具，不是 spec**。看到 Tier 1/2/3 不要當成必跑清單——使用者想動才動，跑不到也不是 fail。

---

*2026-05-22 Binding framework 版本（user × Claude Opus 4.7 共同建構）*