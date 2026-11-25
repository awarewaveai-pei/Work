# 影片工具三項解鎖 派工表（監工用）

續接語：我是「影片工具三項解鎖」的監工。讀本檔＋`PLAN.md`；`mcp__ccd_session_mgmt__list_sessions {linked:true}` 看工人；工人交回照「驗收」做，不問操作者。操作者 2026-11-25 授權：監工派工、選模型、工人 context 過長自行 compact／clear；每批全部交回後一起看 RISKS，處理完才部署。

## 批次
| 批 | 卡 | 內容 | 模型 | session | 狀態 |
|---|---|---|---|---|---|
| 1 | P1 | 肖像權保護 後端＋畫面＋測試 | Opus 5.5 | `vt-p1-privacy` | 已派 2026-11-25 |
| 1 | R1 | sfx／depth 選型查證（只讀） | Sonnet 5.5 | `vt-r1-research` | 已派 2026-11-25 |
| 1b | P1-fix | b1 張數說法、b2 逾時 | Opus 5.5 | `vt-p1-privacy` | 交回 `d3d03adff`，通過 |
| 2 | D1 | 深度影片（`briefs/D1-depth.md`；工作區 `D:/Worktrees/Work/vt-d1-depth`，detached，從 P1 分支切） | Opus 5.5 | `vt-r1-research`（沿用） | 交回 `2f320b7a6`、`d6d96354a`，通過 |
| 2 | S1a | 計費鍵 `video.audio-tools`＋B 路（`briefs/S1-sfx.md`） | Opus 5.5 | `vt-s1-sfx` | 交回 `1611ea608` |
| 2 | S1b | A 路 Mirelo（同一工人接著做） | Opus 5.5 | `vt-s1-sfx` | 交回 `bd201fcd9` |
| 3 | X1 | 刪 `tools-0.js:443-458` 寫死鎖，改讀 `/capabilities` | 監工 | — | main `be6017918`；Codex 修正 `0655120d6` |
| — | DEP | 部署 | 監工 | — | 已部署 `8f477587d` 2026-11-25 |

同時最多 4 個工人；同一條線的下一張卡 `send_message` 給同一個閒置 session（先 `clear_session`）。

## 驗收（每張卡）
1. 讀 FILES／TESTS／COMMITS／RISKS → 讀 diff，回報的 `file:line` grep 驗真；對照卡片不變量逐條看。
2. 整合工作區（detached worktree）：cherry-pick → `npm ci` → 卡片驗收指令重跑一次。
3. privacy 輸出影片監工自己抽格實看（不信回報）。
4. 整批交回後獨立一步「一起看 RISKS」：會出錯貨／沒實看／main 紅 → 當輪處理；要改別的系統 → 掛到下一張卡；理論性 → 記一行。寫進本檔「RISKS 紀錄」。
5. `/codex-review`（額度不足記 `ORACLE_WAIVED`＋突變證據）→ ff 進 `main`（pathspec commit）→ `clear_session` 工人 → 派下一批。
6. 部署前：RISKS 全有處置；向操作者要 go。

## RISKS 紀錄
### 動工前
- r1 正式機無 GPU：privacy 以 CPU 跑，5 分鐘片耗時未知 → P1 實測回報。
- r2 `onnxruntime-node` 在正式映像能否載入未驗 → P1 驗；不行改 `onnxruntime-web`（wasm）。
- r3 參考站同功能的成品是壞的（操作者 2026-11-25 截圖，保護後畫面為橫條雜訊）→ 我方驗收必須實看成品格。
- r4 sfx 付費計費＝動金流（High）→ S1 設計先給操作者看再做。

### 批 1（2026-11-25）P1 `c34d9e116`、`9b990d8db`；R1 `RESEARCH.md`
監工實看：6 秒片原片／成品同格並排，兩位成人與一位小孩的臉都蓋到；另誤蓋膝蓋、欄杆各一處。
| # | 來源 | 風險 | 處置 |
|---|---|---|---|
| b1 | P1 | 「偵測到 N 張臉」N＝軌數，34 秒片報 34 張＝畫面宣稱不實 | 當輪修：退回 P1 改成同時最多張數 |
| b2 | 監工 | 媒體工具逾時 10 分鐘（`api.cjs:1169`）；容器實測約 1 倍片長，正式機更慢時 5 分鐘片會逾時 | 當輪修：退回 P1，privacy 逾時 30 分鐘 |
| b3 | P1 | 頭尾延伸用靜止框，人在走時延伸段蓋偏 | 記一行：多蓋方向，不修 |
| b4 | P1 | 誤蓋（膝蓋、欄杆）；倒立臉偵測不到 | 記一行：畫面已提醒逐段檢查 |
| b5 | P1 | 輸出固定 30 fps、聲音重編 aac | 記一行：同 `follow.cjs` 既有行為 |
| b6 | P1 | 正式機 CPU 速度未測 | 部署後第一件事：正式機跑 30 秒片量耗時 |
| b7 | P1 | 沒在瀏覽器實按 | X1 後監工實按 |
| b8 | P1 | 模型 onnx 232KB 進 git | 接受：MIT，出處與授權寫在 `vendor/face/sources.json` |
| b9 | R1 | ElevenLabs 免費方案不可商用，sfx 目前只靠畫面鎖擋 | PLAN D4：S1 完成前 X1 不解 sfx |
| b10 | R1 | `eleven_text_to_sound_v2` 2027-03-01 移除（`elevenlabs.cjs:80` 沒帶 model_id） | 掛 S1 |
| b11 | R1 | Mirelo 預設可拿輸入輸出訓練，退出要寫信 | 掛 S1（選 A 時操作者待辦） |

### 批 1b（2026-11-25）P1-fix `d3d03adff`
| b12 | 監工 | 「同時最多 N 張」含誤蓋（實跑報 7，實際 4–5 人） | X1 時監工把字改成「同時最多遮蓋 N 處」 |
| b13 | 監工 | `separate` 的 ElevenLabs 列目前在免費方案下可用且已上線＝不可商用的方案在商用 | S1a B2 一起關；另告知操作者 TTS／音樂是否也走免費方案未查 |

### 操作者待辦
- Mirelo：開帳號、買點數、把金鑰放進 `mcp/user-env.ps1` 的 `MIRELO_API_KEY`；寫信 legal@mirelo.ai 要求不拿素材訓練。
- ElevenLabs：升級付費方案（B 路與「只留人聲」才可商用）。

### 批 2（2026-11-25）D1 `2f320b7a6`（工作區 `D:/Worktrees/Work/vt-d1-depth`）
監工實看：孔雀 10 秒片 6 格拼圖，近＝白、遠＝黑合理，整段對比穩定；細節粗（腳不見），屬 256px 小模型的限制。
| # | 來源 | 風險 | 處置 |
|---|---|---|---|
| c1 | D1 | 對齊改用離散度比（最小平方法 300 格後對比剩 1%） | 認可：有測試 |
| c2 | D1 | `depthEnd` 沒填就報錯 | 當輪修：退回 D1，預設 min(片長, 起始＋30) |
| c3 | D1 | `api.cjs` 逾時沒接；`tools-0.js` 鎖還在 | X1 監工接 |
| c4 | D1 | 完整映像沒 build | X1 監工 `docker build` 一次（含 P1、D1 兩個模型層） |
| c5 | D1 | DPT-hybrid 細節較好但慢 55 倍（每格 1.2 秒） | 記一行：無 GPU 不可行；有 GPU 主機時再開卡 |
| c6 | D1 | `tests/backend.cjs` region 段偶發逾時 | 記一行：P1 也遇過一次，機器忙時發生；整合時重跑確認 |
| c7 | 監工 | 容器每格 49 ms → 30 秒片約 1.5 分鐘 | 可接受；正式機部署後實量 |

### 批 2（2026-11-25）S1a `1611ea608`、S1b `bd201fcd9`（分支 `claude/vt-s1-sfx-34383c`）
工人自送 `critic`：0 Critical／0 Major／5 Minor，4 條已修。監工讀過 `main-system.cjs` `paidFeature`、`audio-tools.cjs` 可用性判斷、`api.cjs` 估價分支。
| # | 來源 | 風險 | 處置 |
|---|---|---|---|
| s1 | S1 | A 路沒實跑（無 `MIRELO_API_KEY`） | 操作者待辦；無金鑰時該列不可用（測試守），不擋部署 |
| s2 | S1 | B 路 ElevenLabs 生成沒實跑（免費方案被 B2 擋） | 操作者待辦；升級前該列不可用，不擋部署 |
| s3 | S1 | Mirelo credits 欄格式與單價文件沒寫 | 拿到金鑰後第一次實跑核對帳單；在此之前不可用 |
| s4 | S1 | 付費「只留人聲」可送 60 分鐘、逾時 10 分鐘，逾時時廠商已計費 | 當輪修：X1 音訊工具逾時 30 分鐘（`api.cjs` `jobTimeoutMs`） |
| s5 | S1 | `mirelo.cjs` 沒送審 | 整批外部審查涵蓋 |
| s6 | S1 | `tool-processing.js:72` 註解過期 | 當輪修：X1 |
| s7 | S1 | `tests/tools-workflows.cjs:193` 在原 HEAD 就逾時 | 整合時在 main 上重跑確認；若 main 也紅另記 |
| s8 | S1 | `cost-model.ts` 有改 → next-admin 與 video-workbench 都要部署；next-admin 每晚 03:00 自動部署 main | 推 main 前向操作者要 go；兩邊同一輪部署 |

### X1（2026-11-25，整合工作區 `D:/Worktrees/Work/vt-int`，detached，自 main `e828559c2`）
cherry-pick P1×3、D1×2、S1×2；唯一衝突 `package.json` scripts（兩行都留）。X1 改動：`tools-0.js` 寫死鎖刪除改讀 `/capabilities` 的 `audioTools.<tool>.engines`；`api.cjs` 加 depth 與音訊工具逾時；`face-privacy.cjs` 文字改「同一格最多 N 處（含誤判）」；`tool-processing.js` 註解。

### Codex 外部審查（2026-11-25，整批 `e828559c2..1a07d0759`，artifact `D:/Worktrees/Work/vt-int/agency-os/reports/oracle/2026-11-25-partialreview-4bf6848e.md`）— 3 條，**皆未修、未由監工驗真**
| # | 發現 | file:line | 待辦 |
|---|---|---|---|
| x1 | compose 沒把 `MIRELO_API_KEY` 傳進 video-workbench 容器，Mirelo 列永遠不可用 | `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:733` | 部署時走 `safe-infra-patch.sh compose`（正式機 compose 是機器本地檔），repo 對照檔同步 |
| x2 | 貼著畫面邊角的臉：外擴框被邊界裁切後，橢圓遮罩蓋不到原偵測框的角落＝隱私漏洞 | `backend/face-privacy.cjs:144` | **部署前必修**：遮罩橢圓要包住原偵測框（或邊界處改畫矩形）；補貼邊測試＋一次突變 |
| x3 | Mirelo unmetered 金鑰回 `credits: null` 時仍按秒數估價扣款 | `next-admin/lib/ai/cost-model.ts:293`、`backend/mirelo.cjs:104` | 部署前修：`null`＝0 成本；補測試 |

### 停點（2026-11-25，用量上限）
已完成：P1、D1、S1a、S1b、X1 全在整合工作區 `D:/Worktrees/Work/vt-int`（HEAD `1a07d0759`，detached，未進 main、未 push、未部署）；13 組測試＋tsc 綠；真 Edge 實按三工具；正式映像 build 過。
下一步：驗真並修 x2、x3 → 重跑 `tests/privacy.cjs`、`tests/sfx-billing.cjs` → 寫 WORKLOG 證據行 → 向操作者要合併與部署的 go（next-admin＋video-workbench 同輪；x1 隨部署）。建議模型：Opus 5.5

### Codex 3 條處置（2026-11-25，整合工作區 `ce9c43d8a`）
- x2 驗真（新測試在舊程式上紅：`edge face corner 0,0`）→ 已修：`expandBox` 不再被畫面邊界裁切，`drawMask` 在畫格邊界切橢圓；測試三個貼邊案例。
- x3 驗真 → 已修（操作者 2026-11-25「不扣款」）：`credits` 為 `null`／0＝成本 0；欄位缺或格式不明才估價。突變 `>= 0`→`> 0` 使 `tests/sfx-billing.cjs` 紅，還原綠。
- x1 → repo 對照 compose 已加 `MIRELO_API_KEY`；正式機 compose 於操作者提供金鑰時走 `safe-infra-patch.sh compose` 補。
- 重跑：`tests/{privacy,sfx-billing,backend,p6-main-system}.cjs` exit 0；next-admin `tsc` 0；vitest `lib/ai` 163 passed。
- 停點更新：整合工作區 HEAD `ce9c43d8a`。剩：WORKLOG 證據行＋合併進 main＋部署（等操作者 go）；部署後正式機各跑一支片量耗時（b6、c7）。

### 部署（2026-11-25 10:44Z）
`sg-deploy.sh next-admin video-workbench` → `8f477587d`（前一版 `67b4051c3`；同批帶上 main 上其他 session 的 12 個 commit）。兩容器 healthy；HTTP smoke 全 OK；Playwright smoke 30 passed／0 failed。
正式機同映像臨時容器實量（`--cpus 8`）：34 秒片 privacy 28.4 秒；30 秒片 depth 68.7 秒 → b6、c7 關閉。
未關：操作者登入正式站實按一次；Mirelo 金鑰＋正式機 compose 加 `MIRELO_API_KEY`（`safe-infra-patch.sh compose`）；ElevenLabs 升級付費方案；配音／字幕也走 ElevenLabs 免費方案（未動，待操作者決定）。
