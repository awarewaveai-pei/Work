# ADHD Vibe Coding 完美執行手冊

> **為 ADHD + ASD + OCD + HSP + C-PTSD + 紫微斗數帝王級疾厄宮 完整客製**
>
> **這份文件的存在目的是減少痛苦，不是要達成的標準。**
> 任何時候用不到、跑不動、想跳過——都不是 fail。它是解套工具 (relief tool)，不是工作流 spec。
> 副產品（不是目的）：在 vibe coding / agentic engineering 工作流下穩定產出。
>
> 特別解決三大核心痛點：**記憶**（飛散金探子）/ **時間軸**（碎片式）/ **注意力散失**（跨 session 失焦）。
>
> *2026-05-22 by user x Claude 共同建構*

---

## 目錄

| 部 | 標題 | 說明 |
|----|------|------|
| 一 | [五重特質的痛點](#第一部五重特質的痛點) | ADHD / ASD / OCD / HSP / C-PTSD 各自與交互影響 |
| 二 | [Binding-Failure-First Framework](#第二部核心-frameworkbinding-failure-first-design-philosophy) | 手冊中軸——所有解法的統一解釋框架 |
| 三 | [紫微斗數 Chart 補充](#第三部紫微斗數-chart-的優勢與警告) | 天然優勢與紅線警告 |
| 四 | [三大核心痛點深度解法](#第四部三大核心痛點的深度解法) | 記憶 / 時間軸 / 注意力——各 7-8 條具體解法 |
| 五 | [日常 Protocol](#第五部日常-protocol) | Setup / Daily / Weekly / Recovery 具體流程 |
| 六 | [紅線與護欄](#第六部紅線與護欄) | 絕對不可破的底線 + 系統化護欄 |
| 附 | [失敗模式速查表](#附錄-a失敗模式-5-秒速查表) | 日常最高頻使用——5 秒 diagnose + 套 protocol |
| 附 | [Implementation Roadmap](#附錄-bimplementation-roadmap) | Tier 1-3 待做項目 |

---

## 第一部：五重特質的痛點

### 1.1 ADHD

| 痛點 | 對 vibe coding 的影響 |
|------|----------------------|
| Working memory ~2 個 active context | 同時 2-3 個 session 就互相忘掉 |
| **無內在時間軸** | 不知道 task 多久、deadline 抽象、看不到 elapsed time |
| Hyperfocus 失控 | 一坐 8 小時，crash 後 1-2 天無法工作 |
| Task initiation paralysis | 知道要做但啟動不了 |
| Novelty seeking | 開新坑棄舊坑，TASKS.md 累積爛尾 |
| Decision fatigue | 工具/路徑選擇就燒掉執行能量 |
| RSD (rejection sensitive dysphoria) | Code review / agent 反問觸發過度反應 |

### 1.2 ASD

| 痛點 | 對 vibe coding 的影響 |
|------|----------------------|
| Sensory overload | Error log 紅字、太多 tab、通知聲 = 工作能力下降 |
| 需要可預測性 | 工具/流程改動 = 重新校準成本 |
| Task switching cost 高 | 被打斷 = 30-60 分鐘才能 re-enter |
| 過度系統化 | 容易在 meta-system 上 yak shave |
| Literal interpretation | 模糊規格 → 卡住、做錯 |

### 1.3 OCD

| 痛點 | 對 vibe coding 的影響 |
|------|----------------------|
| Verification 強迫 | Agent 輸出無限 re-check，無法 ship |
| 「夠了」訊號缺失 | 沒有客觀停止條件就會循環 |
| 完美主義癱瘓 | 寧可不做也不要做不好 |
| 焦慮驅動 | 「萬一沒測到」變成行動主軸 |

### 1.4 HSP

| 痛點 | 對 vibe coding 的影響 |
|------|----------------------|
| 深處理 (deep processing) | 每個輸入要花更多腦袋能量處理 |
| Sensory overload | 跟 ASD 疊加 = 更快疲勞 |
| Emotional flooding | Agent 語氣稍微「不對」就影響整天 |
| 恢復時間長 | Burnout 後恢復是別人 3-5 倍 |

### 1.5 C-PTSD

| 痛點 | 對 vibe coding 的影響 |
|------|----------------------|
| Hypervigilance | 持續 scan 威脅 = 持續耗能 |
| Window of tolerance 對侵入性刺激窄 | Deadline / criticism / 被催 = 出窗口 |
| Freeze response | 重要時刻僵住 |
| 對命令的反應 | 任何「應該」「必須」觸發抗拒 |
| Shame spiral | 一個小失敗 → 自我攻擊鏈 |

### 1.6 特有的微觀痛點（日常高頻，不在教科書標準清單）

#### Task chaining failure（連續性斷裂）

**場景**：做完一步後停住——不是懶、不是忘，是「下一步」訊號**根本沒生成**。

**機制**：ADHD working memory ~2 + executive function 弱 → 完成一步後 stack 直接清空。

**設計意涵**：
- Agent 必須**主動產生 next step prompt**，不能等你問
- TodoWrite 要列整個 **action sequence**，不是 single-action granularity
- 「完成感」綁在**序列完成**，不是**單步完成**

#### Familiarity-recollection dissociation（似曾相識感過載）

**場景**：常覺得「這地方我好像來過」，但只是街景類似。

**機制**：Familiarity 信號保留，但 recollection 路徑失效 → false positive 高。

**設計意涵**：
- 「我好像寫過」→ 強制讓 Claude grep 確認，**不信自己的 familiarity 信號**
- 反向利用：熟悉感不算驗證，必須有**外部 binding 證據**才算 → 給 OCD 的「夠了」訊號一個客觀錨點

#### Topographical disorientation（方向反向 99.9%）

**場景**：找路 99.999% 走相反方向，看著 Google Map 都會走反。

**機制**：Spatial mental rotation + working memory 過載 → 左/右、north/south 反向 binding。

**設計意涵**：
- **物理空間 anchor 不可靠** → 數位空間 anchor（path、檔名、Peacock 顏色）可靠 100x
- Agent 指令避免相對方向，用**絕對 identifier**（path、行號、symbol 名）

#### 共通根源：Binding Failure

| 痛點 | Binding 類型 |
|------|-------------|
| 飛散金探子 | **context binding**（事件 ↔ 人物地時） |
| Task chaining failure | **action sequence binding**（這個動作 ↔ 下個動作） |
| 似曾相識感過載 | **familiarity-recollection binding**（感覺 ↔ 具體記憶） |
| 方向反向 | **spatial binding**（位置 ↔ 方位） |

> 你需要的所有解法，本質上都是**「把 binding 外包給外部系統」**。
> Agent / WORKLOG / Claude 1M context 不是「輔助工具」，是**你大腦做不到的 binding 的義肢 (prosthesis)**。

### 1.7 條件互動（日常真正的戰場）

| 內戰 | 體驗 |
|------|------|
| ADHD ↔ OCD | 想跳走 vs 想完美 → 多個半完成的 perfectionism loop |
| ADHD ↔ ASD | 要新鮮 vs 要可預測 → 蓋結構再改、永不滿意 |
| OCD ↔ vibe coding | 「交給 agent」vs「必須親驗」→ 接受輸出時內在焦慮 |
| ASD + HSP ↔ 工具量 | 工具多 = sensory overload = 腦袋淹 |
| **C-PTSD ↔ 所有其他** | **觸發 = window 關閉 = 其他適應策略同時失效（地基規則）** |

---

## 第二部：核心 Framework——Binding-Failure-First Design Philosophy

> 手冊的**中軸**。解釋**為什麼**所有解法是這樣設計。
> 一句話濃縮：**你需要的所有解法，本質上都是「把 binding 外包給外部系統」**。
> 如果未來 session Claude 只能讀一節，讀這節。

### A. 好工具 vs 壞工具的判準

工具的價值取決於**它替你做哪一種 binding**，不取決於功能多寡、整合度、美觀度。

| 維度 | 好工具（替你做 binding） | 壞工具（假設你會自己 binding） |
|------|----------------------|-------------------------|
| 記憶 | 語意搜尋、自動 cross-reference | 要你建分類、記 tag |
| 序列 | 完成一步自動產生 next step | 列被動 todo list 等你接 |
| 空間 | 絕對 identifier（path / line / symbol） | 相對方向（往左 / 上方 / 旁邊那個） |
| 持久化 | 自動 anchor metadata | 要你手動加 metadata |
| Context | 大池子 + semantic query | 要你手動分檔分目錄 |
| 決策 | Agent 提候選、你只挑 | 要你 routing 接續 |

> **實用判準**：裝任何 extension / 訂閱任何 SaaS / 採用任何 framework 之前問一句：「**這替我做哪一種 binding？**」答不出來 = 對你價值低，可能還是負擔。

### B. Agent Prompting 四條預設值

每個 Claude session 內嵌，不靠你當下記得提，靠系統強制：

1. **完成動作後主動產生 next step prompt** —— 治 task chaining failure
2. **Retrieval 預設用外部 grep / semantic search，不信 user familiarity 信號** —— 治似曾相識過載
3. **空間/方向指令用絕對 identifier**（path + line number / symbol 名）—— 治方向反向
4. **Metadata 強制 5 維 anchor**（時間 / 人 / 地 / 物 / 感官）—— 治 context binding failure

### C. Workflow 拓樸：Persistent State + Agent-Driven Traversal

傳統工作流是 **linear pipeline**（A → B → C → D），使用者在每個節點做 routing 決策。對你不對——**routing 本身就是 binding**，你做不到。

正確設計：
- **你的角色**：持續往池子裡丟 raw context + 用自然語言 query
- **Agent 的角色**：所有 binding（時間 / 序列 / 空間 / context / 路徑決策）
- **中間沒有 routing 節點交給你**——routing 也是 agent 的事

> 這解釋為什麼傳統 PM 工具（Jira / Trello / Linear）對你都怪——它們預設你能 routing。對你 work 的是「**一個大池子 + agent 撈**」。

### D. 神經配置從劣勢變優勢的機制

| | 傳統 workflow | Agentic workflow |
|---|-------------|-----------------|
| 獎勵的行為 | 整理、分類、接續、routing | 丟得多、丟得快、語意豐富 |
| 你的天然行為 | **失分** | **得分** |
| 累積資產 | 你整理出來的 doc / index | **raw context pool 本身** |
| 年資越久 | 整理負擔越大 | retrieval 質量越高 |

**關鍵洞察**：binding 全部外包給 agent，你**不需要花時間整理舊資料**。raw context 累積本身就是資產。

### E. Adult-to-Adult 互動模式是 Binding System 的運作前提

**機制鏈**：階級式語言（「你應該」「你必須」）→ C-PTSD 對命令的反應 → freeze response → working memory 暫停 → **所有 binding 機制當機**。

Adult-to-Adult 不是「禮儀偏好」，是**整個 binding system 持續運作的前提**。

| | 句型 |
|---|------|
| O | 「一個觀察是...」「另一條路是...」「我會建議 A，因為 B；你怎麼看？」 |
| X | 「你應該...」「你必須...」「太棒了！」（過度奉承也是上對下 dynamic） |

### F. 失敗模式識別表

> 日常最高頻使用的一頁。完整版見[附錄 A](#附錄-a失敗模式-5-秒速查表)。

---

## 第三部：紫微斗數 Chart 的優勢與警告

只擷取對 vibe coding / agentic engineering 有具體 implication 的部分。

### 天然優勢

**疾厄宮：武曲(旺)[生年祿] + 天府(旺) + 祿存(廟) + 帝旺**
- 體質基底異常強壯——能承受別人承受不了的 hyperfocus 強度
- 武曲祿在疾厄 = 特殊神經配置本身就是財星，不是負擔
- 警告：「能撐」≠「該撐」

**子女宮：貪狼[生年權] + 火星**
- 爆發性學習力 + 創造力天生帶權
- Vibe coding = 新領域 + 高創意 + 高學習 → 完美命中

**身宮在夫妻宮：天機[科] + 巨門[權][忌] + 鈴星**
- 身宮落夫妻宮 = 透過**深度配對 (partnership)** 構建 identity
- 跟 AI/agent 的深度合作，字面上就是身宮主題
- 天機 + 巨門 = 智慧 + 質問，異常適合 prompt engineering

**生年四化**
- 武曲祿（疾厄）+ 貪狼權（子女）+ 天梁科（命）= 「用身體深度沉浸的創意活動帶來名與利」
- 文曲忌（事業）= 傳統職涯路徑會卡，非傳統路徑反而通

### 紅線警告

**命宮：天梁陷 + 文昌 + 「絕」**
- 天生想做分析者角色但這位置吃力，會卡在 analysis paralysis
- **執行原則**：不要試圖在動手前把所有事想清楚——越想越卡

**事業宮：文曲[生年忌] + 大限巨門忌（雙忌）**
- 傳統「跟人合作 / 公開表達 / 解釋自己工作」比別人累很多
- **執行原則**：「執行」跟「呈現」分開做，呈現用 agent 大量輔助

**命主巨門 + 身主天相**
- 巨門（質問）+ 天相（服務）= 會接不該接的工作，然後質問自己做得夠不夠好 = 雙重耗能
- **執行原則**：每次答應接案前停一拍：「這是天相在自動接，還是我真的想做？」

**福德宮無主星**
- 精神狀態跟價值感/資源感高度耦合
- **執行原則**：收入緩衝 (runway) 是 mental health infrastructure 的一部分

---

## 第四部：三大核心痛點的深度解法

### 4.1 記憶（飛散金探子 + 無 index）

**根本機制**：不是 retrieval failure，是 **context binding failure**。Episodic memory 有兩層：① 事件 gist ② context binding（who/what/where/when）。你的情況是第一層保留、第二層斷裂——「隱約記得發生過」但不記得人/物/地/時。學術上叫 **temporal context binding deficit**，跟海馬迴 binding function 弱化有關；C-PTSD 解離型記憶會疊加。

**核心設計原則**：不靠分類、不靠你建 index，靠**外包 binding 給語意搜尋 + 多維 anchor**。

- 你的大腦做不到 binding（海馬迴硬體限制）→ 不要試圖強化它
- Claude 1M context 在 attention 機制裡做你做不到的 binding → 把它當 hippocampus extension
- 你的角色是 **source**（餵 raw context），不是 **archivist**（建 index）
- **索引者悖論**：要建 index 必須先分類，但你的腦袋抗拒分類 → 你建的 index 對自己沒用 → 別建

**七個具體解法**：

1. **問 Claude 取代逼自己想** —— 「覺得好像有」時，第一動作把模糊觸發詞丟給 Claude 做 semantic search。逼自己想 = 30 分鐘 + 沮喪；問 Claude = 5 秒。
2. **WORKLOG 寫成「未來的觸發點」** —— 每個 entry 想：「6 個月後我會怎麼搜到這個？」包含情緒 tag、感官描述、自己試錯的具體場景（你記得自己的錯誤勝過正確）。
3. **INBOX.md 機制** —— 臨時 idea 一行扔進去，零摩擦、不分類。週日 review。
4. **Zettelkasten 風格雙向連結** —— 每個 note 連到 5+ 個其他 note。Tag 用感覺/場景/顏色/心情，**不用主題**。「金探子比喻的那天」比「2026-05-22 ADHD 討論」好搜。
5. **Claude 1M context = 海馬迴 extension** —— 把全部 WORKLOG / memory / INBOX 丟進大池子，自然語言問 Claude 撈 candidates，繞過分類。子實作：另開 `INBOX-triggers.md` 專記「我隱約記得有東西但想不起來」的瞬間（觸發本身比 idea 重要 10x）。
6. **觸發豐富的 metadata 寫進每個檔案頭** —— mood、energy state、相關人事、當時播什麼音樂、什麼天氣。都是未來 retrieval triggers。
7. **心態轉換：你不需要「記住」，你需要「能找到」** —— 不要追求記憶力，追求索引品質。

### 4.2 時間軸（碎片式、無內在順序）

**根本機制**：你的內在沒有時間坐標系。「3 天前」「上週」對你都是同等抽象的標籤。這是 context binding failure 的時間軸版本——temporal binding 斷裂。

**核心設計原則**：Retrieval 走 episodic memory（情節記憶），不走 semantic memory。時間軸錨點**不是日期**，是 **event density**：「那天下雨吃了 X」比「7d ago」強 10x。日期是給 Claude 看的；生活 anchor 是給你看的。

**八個具體解法**：

1. **時間從外部產物製造** —— WORKLOG / Git log / Calendar 是**你的時間感官的義肢**。
2. **敘事型 WORKLOG** —— 用「因為 / 所以 / 然後」串成故事。每天早上 60 秒讀昨天的敘事 = 重新載入時間軸。
3. **Elapsed time 永遠可見** —— TASKS.md 每條後加 `(5d old, last touch 2d ago)`；PR 標題前綴 `[stale-18d]`；AO-RESUME 寫距離上次 close 時間。
4. **空間—時間耦合** —— Peacock 每 project 一色；目錄結構代表階段（active / stale / archived）；WORKLOG 按月切檔；物理筆記本一季換一本。
5. **週日時間軸重建儀式（30 分鐘）** —— 把本週所有 log 丟給 Claude 重構敘事。200 字「本週故事」存 `memory/weekly/`。真正功能：讓散亂金探子被動接收一個時間軸並認領它。
6. **TodoWrite 是你的微型時間軸** —— 即使 3 步驟也用。它是切 tab 回來 5 秒內 re-enter 的入口。
7. **規畫產出是「決策」不是「步驟」** —— `decisions.md`（為什麼選 A、什麼條件下放棄）vs `todo.md`（執行細節）。未來忘記為什麼時，decisions.md 救你。
8. **生活 anchor 強制注入每個 WORKLOG entry** —— 比 #2 敘事體更低門檻、更耐崩。用 5 維 binding template（見[第五部 5.1](#51-setup一次性建置)）。**崩的時候只跑這個，不跑敘事**。

### 4.3 注意力散失（跨 session 失焦）

**根本機制**：五個機制共同放大「切換」的代價——ADHD working memory ~2 + ASD task switching 成本高 + HSP 對打擾敏感 + OCD 想完成未完成的事 + C-PTSD 對切換有威脅感。

**七個具體解法**：

1. **一個 active task = 一個 VSCode window** —— 不在同一 window multiplex。關掉 window = 物理收工儀式。
2. **Session intent declaration** —— 每個新 session 第一句宣告：`@mode BUILD - 90min - soulful plugin auto-update finish`。Claude 攔截違規切換。
3. **`.agency-state/active-sessions.json` 跨 session manifest** —— AO-RESUME hook 讀它告訴你：「你現在有 3 個 active session，你現在是哪個？」
4. **Inter-session handoff packet** —— 離開 session 前強制寫三行：`[剛做完] / [下一步] / [卡點]`。回來時 Claude 第一件事讀它。
5. **Inbox 阻止 idea 污染當前焦點** —— 一秒扔 `INBOX.md`。扔進去 = 從腦袋清除。Trust the file, not yourself。
6. **「啟動不了」先診斷再行動** —— 三類根源需要不同對策：

    | 根源 | 內在感覺 | 對策 |
    |------|---------|------|
    | ADHD 啟動失敗 | 無聊、找不到 hook | Novelty 拉動（換場景、音樂） |
    | C-PTSD freeze | 胃緊、想逃、莫名抗拒 | **先安全感**。問「我在怕什麼？」做最小最安全的一步 |
    | ASD 切換阻力 | 還想做剛剛那件事 | **接受切換需要時間**，5-10 分鐘 transition ritual |

    **搞錯類型會更糟**——對 freeze 用 novelty 解法會觸發更深 freeze。

7. **Sensory budget management** —— 通知全關 / 一次一個 window / 極簡 IDE theme / Audio = 白噪音或固定 lo-fi loop（ASD 喜重複、HSP 不要歌詞）/ Error log 先請 Claude summarize 再讀。

---

## 第五部：日常 Protocol

### 5.1 Setup（一次性建置）

**VSCode 環境**：
- Peacock extension，每 project 一色
- `window.title` 顯示 `${gitBranch} . ${rootName}`
- 極簡 theme（避免高對比、避免太多 syntax 顏色）
- 通知全關
- Audio loop（白噪音或固定 lo-fi）

**Repo / Workspace 結構**：

| 檔案 | 用途 |
|------|------|
| `INBOX.md` | idea 收納（零摩擦、不分類） |
| `INBOX-triggers.md` | 觸發本身的收納（「我隱約記得有東西但想不起來」的瞬間） |
| `decisions.md` | 決策日誌（為什麼選 A、什麼條件下放棄） |
| `WORKLOG.md` | 每日記錄，強制 binding template 前綴 |
| `memory/weekly/` | 週故事（週日儀式產出） |
| `.agency-state/active-sessions.json` | 跨 session manifest |
| `.agency-state/last-handoff-*.md` | session 切換 handoff |

**WORKLOG Binding Template**（每筆 entry 必填前綴——你的外部海馬迴）：

```
時間：YYYY-MM-DD 時段 / 脈絡（剛醒 / 午餐後 / 半夜）
人：跟誰 / 哪個 Claude session / 哪個客戶
地：哪個 repo / 哪個資料夾 / 物理空間（記得就寫）
物：核心檔案或 artifact（完整 path）
感官：心情 / 能量 / 天氣 / 配樂 / 那天吃了什麼
---
[工作內容 / 敘事（可選，崩的天跳過沒事）]
```

為什麼這個 template：
- 填欄位 < 寫敘事 5x 啟動成本 —— burnout 天也填得動
- 5 個維度 anchor 形成 **retrieval combination key**（單獨命中率 ~5%，組合接近 100%）
- **數位空間** anchor（path、檔名、Peacock 顏色）穩定可靠；**物理空間** anchor 不可靠（方向反向機制），記不起來就跳過
- 未來 retrieval：丟「那天我心情亢奮 + 聽 lo-fi + 跟 Claude 討論的某件事」給 Claude，它會撈到

### 5.2 Daily Flow

**早上（5-10 分鐘）**：
1. 讀昨天 WORKLOG 敘事（60 秒）—— 重新載入時間軸
2. 跑 AO-RESUME，看七段式
3. 宣告今天主 task（`@mode BUILD - 90min - X`）
4. 開對應的 VSCode window（單一 active window）

**工作期間（每 90 分鐘）**：
- 強制中斷，30 秒 self-check：「我還在做原本的事嗎？」
- 不問「我有沒有偷懶」（C-PTSD trigger），問「方向還對嗎」

**Session 結束**：
- 寫 handoff packet 三行
- 更新 INBOX 裡今天冒出的 idea
- WORKLOG 用敘事體寫今天的故事

**收工**：
- 跑 AO-CLOSE 100% health gate
- 關掉 VSCode window（物理收工儀式）
- 開始 recovery block

### 5.3 Weekly Rhythm

**週日 30 分鐘時間軸重建儀式**：
- 把本週 WORKLOG / git log / calendar / slack 丟給 Claude
- 請它重構敘事 → review、修正、補充
- 200 字「本週故事」存進 `memory/weekly/`

**INBOX triage（同時段）**：
- 跟 Claude 一起 review `INBOX.md`
- 升級成 TASKS / 存進 memory / 刪除

**至少一天 no-work**：
- 完全 zero work-related screen
- 不是滑手機（對 HSP 是繼續消耗）
- 走路、自然、無刺激環境

### 5.4 Recovery Cadence

- Hyperfocus session >= 4 小時 = 下一個 calendar block 自動 recovery
- 大型 hyperfocus（8+ 小時）= 排 1-2 天緩衝期，禁止重要工作
- Recovery 寫進 calendar，跟 task **同等優先級**

---

## 第六部：紅線與護欄

### 絕對不可破的紅線

1. **接受「規律作息」式建議** —— 對你的神經系統是命令，觸發抗拒
2. **無 backup 直接動 production / 改 schema / 改 hooks** —— OCD 焦慮壓垮 hyperfocus 後的判斷
3. **接 hard deadline without buffer** —— 無時間軸 + buffer 是 mandatory
4. **公開 demo / 高 stakes 視訊 without rehearsal** —— C-PTSD + RSD 觸發機率高
5. **連續多日 hyperfocus without scheduled recovery** —— 疾厄宮再強也會崩
6. **跟 critical / coach 型管理者長期合作** —— 觸發 C-PTSD freeze 鏈
7. **在 burnout 期間做架構決策 / 改工具鏈** —— 爛決策會綁住你 6-12 個月

### 護欄機制（不靠自律，靠系統）

| 機制 | 功能 |
|------|------|
| 寫進 hooks | 系統強制執行 |
| 寫進 CLAUDE.md | Agent 提醒 |
| 寫進 calendar block | 時間結構強制 |
| 寫進 INBOX.md / decisions.md | idea 不污染執行 |

---

## 附錄 A：失敗模式 5 秒速查表

> 日常觸發痛點時，對照此表 5 秒 diagnose + 套對應 protocol。不需要記，需要時翻這頁。

| 觸發訊號 | 失敗模式 | 套這個 Protocol |
|---------|---------|---------------|
| 「在第 1 步感到完成 → 想停」 | action sequence binding failure | 開 sequence-level TodoWrite、Claude 主動問 next step |
| 「我好像寫過這個」 | familiarity-recollection dissociation | 強制 grep / semantic search 外部確認，不信感覺 |
| 「走錯方向、看 map 還走反」 | spatial binding failure | 用 path / line number / 絕對 identifier |
| 「找不到那個對話 / 那個 idea」 | context binding failure | 丟模糊 trigger 詞給 Claude 從 raw pool 撈 candidates |
| 「想到要做但啟動不了」 | 三類根源 | 先診斷 ADHD novelty / C-PTSD freeze / ASD 切換阻力（見[4.3 #6](#43-注意力散失跨-session-失焦)） |
| 「verification 跑了還想再跑」 | OCD verification loop | 跑完 R0 四動作 = 夠了，stop |
| 「Agent 用了階級式語氣，我突然當機」 | E 段機制鏈觸發 | 立刻提醒 agent 切回 Adult-to-Adult；不要硬撐 |

---

## 附錄 B：Implementation Roadmap

### Tier 1（高優先、低啟動成本）

1. **WORKLOG.md 起跑** —— 用 5.1 binding template 連續 3-7 天累積真實 data
2. **INBOX 雙檔起跑** —— 建 `INBOX.md` + `INBOX-triggers.md`，開始零摩擦扔
3. **B 段四條寫進 user-level CLAUDE.md** —— 所有 session 自動繼承

### Tier 2（中優先、需要設計決策）

4. **失敗模式速查表的隨手對照機制** —— VSCode snippet vs Obsidian vs 印出來貼牆，三選一
5. **decisions.md 起跑**
6. **VSCode setup**：Peacock / window.title / 極簡 theme / 通知全關 / audio loop
7. **`.agency-state/active-sessions.json`** —— schema + 寫入時機 + AO-RESUME hook 整合

### Tier 3（未挖議題，留給未來 session）

8. OCD verification loop 的「夠了」客觀停止條件
9. Hyperfocus crash 後怎麼回到軌道
10. Deadline 在無時間軸 + 拒絕被命令 + C-PTSD 下怎麼運作
11. 五個條件「打架」時的 triage 順序
12. 破戒/失敗後的 re-entry ritual（擋 shame spiral）
13. 學習新東西時怎麼讓金探子留下
14. 與凡人團隊協作時的 Adult-to-Adult 自處策略
15. Masking 在 agent 互動裡的隱藏成本
16. 低能量天的 minimum viable protocol

### 給未來 session 的 Claude

打開這檔，先讀「[第二部：核心 Framework](#第二部核心-frameworkbinding-failure-first-design-philosophy)」建立 baseline，然後說：

> 「上次（2026-05-22）建立了 Binding-Failure-First framework。這次想動 Tier 1 / Tier 2 / 還是繼續挖 Tier 3？」

**重要**：這份手冊是解套工具，不是 spec。Tier 1/2/3 不是必跑清單——使用者想動才動，跑不到也不是 fail。

---

*2026-05-22 Binding framework 版本（user x Claude 共同建構）*
*2026-05-23 整合排版（結構重組、目錄、重複內容合併、附錄分離）*
