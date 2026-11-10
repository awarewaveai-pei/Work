# S4 圖片轉 3D 供應商調查（2026-11-03）

範圍：只做調查，不改程式。所有來源查核日期 = 2026-11-03（除非另註）。「未公開」= 官方頁沒寫；「未查到」= 本次搜尋找不到。

## 0. 結論先講

- **Meshy 可能違反「不用中國公司」硬規則**（見 §1）。adapter 已寫好，但在操作者裁決前不應設為預設供應商。
- 付費主力建議：**Stability AI 託管 API**（英國倫敦；SPAR3D US$0.04／次、SF3D US$0.10／次）。
- 付費備援：**fal.ai 上的 Microsoft TRELLIS.2**（fal 美國舊金山；模型 Microsoft、MIT 授權；US$0.25–0.35／次）。
- 本機免費：**Stable Fast 3D**（官方 6 GB VRAM，RTX 5060 Laptop 8 GB 放得下）。
- 綁骨／動作：非中國供應商中**沒有一家同時提供 image→3D + 自動綁骨 API**。改用既有 P5 Blender 管線（retarget）補，不另找供應商。

## 1. Meshy 所有權（硬規則判定所需）

| 事實 | 來源 |
|---|---|
| 對外總部：Sunnyvale, CA（官方徵才頁寫 Silicon Valley） | https://jobs.ashbyhq.com/meshy/1d8701dc-6bb7-4abb-94be-df75c67710e8 |
| 營運實體 = 北京格拉菲克斯科技有限公司（Beijing Gelafeikesi Technology Co., Ltd.），2021-05 成立，法人胡淵鳴，100% 由 Taichi Graphics HK Limited 持有 | https://baike.baidu.com/en/item/Meshy/4642307 |
| 2026-07 B 輪約 US$4 億：IDG、經緯中國（Matrix Partners China）、Monolith 領投；既有股東 Granite Asia、紅杉中國、BAI、源碼資本跟投 | https://finance.eastmoney.com/a/202607203812500137.html ；https://seedtable.com/companies/meshy/funding-rounds/series-b-2026-07 |

判讀：美國有門面，但營運實體在北京、母公司在香港、主要股東為中國 VC。依「NO Chinese-owned」字面 → **不合格**。北京實體目前僅百度百科單一來源，未查工商登記；需操作者裁決（排除 / 例外核准）。

## 2. 付費供應商比較

單價換算：Meshy 以有 API 的最便宜方案 Pro US$20／1,000 credits = **US$0.02／credit**（https://help.meshy.ai/en/articles/12062933-meshy-pricing-plans-free-pro-studio-enterprise ）。Meshy credit 數取自 https://docs.meshy.ai/api/pricing.md 。

| 供應商 | 公司／總部／所有權 | API | USD／次（算式） | 品質依據 | 貼圖／PBR | 綁骨／動作 | 格式 | 速度 | 輸出授權 | 資料處理 | 限流 | 免費額度 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Meshy** | 見 §1（⚠ 中國關聯） | 有（Pro 以上） | meshy-6 網格 20cr=$0.40；+2K 貼圖 30cr=**$0.60**；6-lite 網格 5cr=$0.10；綁骨 5cr=$0.10；動作 3cr=$0.06/個 | 未查到獨立基準 | 有，2K/4K/8K | **有**（綁骨＋動作） | GLB/FBX 等 | 未公開 | 付費：資產歸用戶；免費：CC BY 4.0 | 資產保留 Pro 3 天／Studio 14 天；訓練政策未公開；列 ISO 27001／SOC 2 | 20 req/s（Enterprise 100） | 100 cr/月，無 API |
| **Stability AI API**（SF3D／SPAR3D） | Stability AI Ltd，倫敦；投資人 Coatue、Greycroft、Sony/UMG/WMG、EA 等（https://tech.eu/2026/08/25/stabiityai-raises-76m-with-warner-and-sony-investing/ ） | 有 | 1 credit=$0.01；SF3D 10cr=**$0.10**；SPAR3D 4cr=**$0.04**（https://docs.stability.ai/pricing ） | 官方：SF3D「<1 秒」、UV 展開 | SF3D 預測 roughness／metallic（每物件一組，非完整貼圖組） | 無 | GLB（GitHub README） | 官方稱 <1 秒（模型卡） | 用戶保留內容所有權；API 用量不受 Community License $1M 上限（該上限針對自架權重） | **預設可能拿來訓練，帳戶頁可關閉**（https://kb.stability.ai/knowledge-base/opt-out-of-data-training-for-platform-api ）；禁用輸出訓練競品模型（https://stability.ai/terms-of-service ） | 150 req/10s，超過 429 鎖 60s（https://docs.stability.ai/faq ） | 25 credits（=$0.25） |
| **fal.ai × TRELLIS.2** | fal（Features & Labels），舊金山（https://techcrunch.com/2025/10/21/sources-multimodal-ai-startup-fal-ai-already-raised-at-4b-valuation ）；模型 Microsoft，MIT | 有 | 512p **$0.25**／1024p **$0.30**／1536p **$0.35**（https://fal.ai/models/fal-ai/trellis-2 ） | 官方 H100 時間：512³ 3s、1024³ 17s、1536³ 60s（https://github.com/microsoft/TRELLIS.2 ）；無獨立品質基準 | **有**：base color／roughness／metallic／opacity | 無 | GLB（WebP 貼圖） | 見左 | 頁面標「Commercial use」；模型 MIT | 未公開 | 未公開 | 未公開 |
| **Replicate × TRELLIS v1** | Replicate，已被 Cloudflare（美）收購（2025-11 宣布，https://the-decoder.com/cloudflare-acquires-replicate-with-its-50000-ai-models/ ） | 有 | 約 **$0.036**（A100 80GB，約 26 秒）（https://replicate.com/firtoz/trellis ） | 無 | 有貼圖 | 無 | GLB／Gaussians | ~26 秒 | 模型 MIT；**社群維護，非 Microsoft 官方** | 未查 | 未查 | 未查 |
| **Sloyd** | Sloyd AS，挪威奧斯陸（https://map.getclera.com/company/sloyd ） | 有，預付 credits | $1=75cr；有貼圖 image→3D 20cr=**$0.27**；最低購買 $12/900cr（https://www.sloyd.ai/api/pricing ） | 無；**底層模型未公開**（可能轉售他家，需問） | 「AI materials」，PBR 未明說 | API 無（另有 Animations 產品） | GLB/FBX/OBJ/USD/BLEND/STL… 12 種（https://www.sloyd.ai/api ） | 未公開 | 未公開 | 未公開 | 未公開；餘額不足回 402 | 無（$12 起） |
| **CSM（Common Sense Machines）** | 2026-01 被 Google 收購，團隊併入 DeepMind（https://www.gunder.com/en/news-insights/client-news/gunderson-dettmer-represents-common-sense-machines-in-acquisition-by-google ） | **狀態不明**：2026-11-03 本機 `csm.ai` DNS 解析失敗（ENOTFOUND） | 不適用 | — | — | — | — | — | — | — | — | — |
| **Kaedim** | 英國（Bristol 創立、倫敦／美國辦公室，https://greekcitytimes.com/2023/07/26/young-greek-innovators-making-an-impact-on-forbes-european-under-30-list/amp ） | 僅企業合約（第三方說法） | **未公開**（官方 pricing 頁 404） | — | — | — | — | — | — | — | — | — |
| **Luma** | 美國 | Luma API 只有影片／圖片，**無 3D 端點**（https://docs.lumalabs.ai/docs/api ） | 不適用 | | | | | | | | | |
| **NVIDIA build.nvidia.com × TRELLIS** | NVIDIA（美）；模型 Microsoft | 有，但**僅 Trial ToS，非正式生產** | 未公開 | — | 有 | 無 | GLB | 未公開 | NVIDIA Community Model License | 未公開 | 未公開 | 試用 |

（https://build.nvidia.com/microsoft/trellis ）

已排除（中國）：Tripo/VAST、Rodin/Hyper3D/Deemos、Hunyuan3D/Tencent、TripoSR（任務前提）；搜尋中出現的 Hitem3D、ModelsLab 未查所有權 → 不納入。

品質：唯一學術化的人評平台 3D Arena（https://arxiv.org/abs/2506.18787 ）的即時排行榜本次載不出來；其餘「排名」皆為廠商部落格，不採用。**本文無可信的跨供應商品質排序**，需自測（§6）。

## 3. 本機（免費路徑）

| 模型 | VRAM | 8 GB 筆電可跑？ | 授權 | CPU（ks-aw-01 無 GPU） | 來源 |
|---|---|---|---|---|---|
| **Stable Fast 3D** | 約 6 GB（單張） | 可 | Stability Community License：年營收 < US$1M 免費商用，超過需 Enterprise；輸出歸用戶 | 無 GPU 自動走 CPU；**CPU 耗時未公開 = 未知** | https://github.com/Stability-AI/stable-fast-3d ；https://stability.ai/license |
| **SPAR3D** | 預設 10.5 GB；low-vram ≈7 GB（README 另一處寫 6 GB） | 勉強（low-vram 模式） | 同上 Community License | 支援 CPU，README 原話「will be really slow」，無數字 = 未知 | https://github.com/Stability-AI/stable-point-aware-3d ；https://huggingface.co/stabilityai/stable-point-aware-3d |
| **TRELLIS v1** | ≥16 GB | 否 | MIT（部分子模組另有授權） | 未提 | https://github.com/microsoft/TRELLIS |
| **TRELLIS.2** | ≥24 GB | 否 | MIT（nvdiffrast 等相依另有授權） | 未提；只在 Linux 測過 | https://github.com/microsoft/TRELLIS.2 |

結論：本機只有 SF3D 穩跑；ks-aw-01 上的 CPU 推論沒有任何公開數據，視為不可依賴。

## 4. 建議與月費

- 主力付費：Stability API。理由：非中國、單價最低、限流明確、條款公開。缺點：無綁骨、SF3D 只有每物件一組 PBR 參數。
- 備援付費：fal TRELLIS.2（PBR 貼圖較完整，但單價 3–8 倍）。
- 本機：SF3D（筆電），失敗或筆電離線 → 走雲端。
- 綁骨：P5 Blender 管線處理，不靠供應商。
- Meshy：操作者裁決前保持 adapter 存在但停用；若核准例外，它是唯一一站式（貼圖＋綁骨＋動作）。

| 月量 | Stability SPAR3D | Stability SF3D | fal TRELLIS.2 @1024p | Sloyd（有貼圖） | Meshy（meshy-6+2K，對照用） |
|---|---|---|---|---|---|
| 50 次 | 50×$0.04=**$2** | 50×$0.10=**$5** | 50×$0.30=**$15** | 1,000cr÷75=**$13.3**（最低購買 $12） | 1,500cr → Premium **$40** |
| 200 次 | **$8** | **$20** | **$60** | 4,000cr÷75=**$53.3** | 6,000cr → Ultra **$100** |

Meshy 方案額度：Premium $40/3,000cr、Ultra $100/8,000cr（help.meshy.ai 同上連結）。

## 5. 風險

1. Meshy 所有權——硬規則衝突（§1）。
2. Stability 預設可能用 API 資料訓練 → 開通當天必關 opt-out，並截圖存證。
3. Stability 財務曾不穩（2024 換 CEO、重組，https://abcnews.go.com/Business/wireStory/ai-image-generator-startup-stability-ai-reshoot-new-111409201 ）→ 這是保留 fal 備援的理由。
4. 自架 SF3D／SPAR3D 若公司年營收 ≥ US$1M → 需 Enterprise License（API 用量不受此限）。
5. Sloyd 底層模型未公開，可能轉售中國模型 → 未書面確認前不接。
6. CSM 已被 Google 收購且網域本機解析失敗 → 不接。
7. RTX 5060 屬新世代 GPU，SF3D 自帶的 C++/CUDA 擴充（貼圖烘焙、UV 展開）能否在該卡編譯 → 未驗證（推論，非來源事實）。

## 6. 自測必量項目

同一組 10 張圖（人物、產品、硬表面、透明／反光物、毛髮各 2）跑 SF3D 本機、SPAR3D API、TRELLIS.2@fal 1024p：
- 每次實際耗時（含排隊）與實際扣款（對帳單，不信價目表）。
- GLB 面數、貼圖解析度、是否有 roughness／metallic 貼圖、背面品質。
- 匯入 P5 Blender 管線：能否 retarget、是否需清理拓樸。
- 本機 SF3D：VRAM 峰值、單張秒數、RTX 5060 能否編譯擴充。
- （若要評估 ks-aw-01 CPU）SF3D 單張 CPU 秒數與記憶體峰值——目前無公開數據。
- Stability 帳戶 training opt-out 已關的截圖。

## 7. S4b 設計（2026-11-10）

現況：`backend/meshy.cjs:46` 唯一 adapter；`backend/api.cjs:373-397` 專為 `meshy-image-to-3d` 寫一段；`scripts/tools-3d.js:522` 面板只有 Meshy。價格已在 `next-admin/lib/ai/cost-model.ts:196-198` `TOOL_RATES`（3d-spar3d／3d-sf3d／3d-trellis）。

- **一個 operation**：`image-to-3d`，`settings.method` ∈ `stability-spar3d`｜`stability-sf3d`｜`local-sf3d`｜`replicate-trellis`｜`meshy`。`backend/image-to-3d.cjs` = 方式表＋`capability(env)`＋`request()`＋`run()`；各 adapter 只實作 `run(job, ctx) → {buffer|file, origin}`。舊 `meshy-image-to-3d` 只留在 `main-system.cjs` ledgerKind 讀舊紀錄。
- **價格來源**：只讀 `TOOL_RATES`（不另建表）；`local-sf3d` = 0；Meshy 無美元價目 → 只在設了 `MESHY_API_KEY` 時列出、顯示點數。`/capabilities.imageTo3d.methods[]` 帶 `usd`／`estimate`／`available`／`reason`，頁面每個方式按鈕與「產生」按鈕都顯示價格。**預設 = SPAR3D**（S4b.2 結果，§8）。
- **一個 job id 只呼叫廠商一次**：呼叫前寫 `job.vendorCall = {method, at}` 並 persist；`run()` 見到已有 `vendorCall` 直接失敗（不重送）。Stability 同步回 GLB（失敗不計費）；TRELLIS／Meshy 非同步：預測編號寫 `job.vendorTaskId`，同圖同選項的未完成任務跨 job 沿用（同 remove-bg）；取消 → Replicate cancel。
- **本機 SF3D**：`backend/sf3d-local.cjs` 起獨立程序 `VW_SF3D_PYTHON <VW_SF3D_DIR>/run.py <圖> --output-dir <workdir> --texture-resolution 1024`；環境最小化＋`HF_HUB_OFFLINE=1`（權重安裝時先下載，執行期不上網）；一次一個（8 GB VRAM）；取消／逾時（10 分）殺整棵程序樹（沿用 `blender.cjs` `killTree`）。未設兩個變數 → 方式按鈕停用並顯示「未安裝」。安裝（一次，操作者需先在 Hugging Face 同意 `stabilityai/stable-fast-3d` 授權）：clone `Stability-AI/stable-fast-3d`、venv 裝 torch（CUDA 12.8，RTX 5060 需要）與 requirements、`huggingface-cli download stabilityai/stable-fast-3d`。ks-aw-01 無 GPU → 不設。 實裝（2026-11-10）：`scripts/sf3d/install.cmd`（VS 2022 Build Tools VCTools＋torch cu128＋`gpytoolbox==0.3.8`（0.2.0 無 py3.12 wheel、sdist 壞）＋`scripts/sf3d/texture-baker-cpu.patch`（沒有 nvcc 只編 CPU 烘焙，CUDA 張量繞 CPU））；權重在 `runtime/sf3d/.hf`（`sf3d-local.cjs` 預設 HF_HOME）、rembg 模型在 `~/.u2net`。單張 17 秒、峰值 6.2 GB。安裝腳本重跑驗證時 uv_unwrapper 重編後載入失敗（未解，見 WORKLOG）。
- **自動人形骨架**：Blender 任務 `blender-autorig`（`backend/blender/autorig.py`）：匯入無骨架 GLB → 量體型取 13 個關節點（可由頁面改）→ Rigify `human` metarig（去臉、去手指）對到關節點當變形骨架 → 自動權重（bone heat 失敗的頂點改最近骨段）→ 有選動作就用 `retarget.py` 同一套 delta 重定向 → GLB。不產生 Rigify 控制骨架：glTF 不帶約束，檢視器自己做 FK／IK。
- **動作庫**：`backend/blender/motions/cmu/*.bvh`＋`index.json`（中文名、CMU 編號、CMU→metarig 骨名對照一份）。來源 una-dinosauria/cmu-mocap（Bruce Hahne BVH 轉檔；CMU：「free for use in research and commercial projects worldwide」）。BVH 依自身 frame time 換成場景 fps。
- **保存重開可改**：場景物件存 `rig: {sourceAssetId, landmarks, motion}`；重開後可改關節點或動作，按「重新綁骨」從原始網格重跑，換成新 GLB、場景新版本。

## 8. S4b.2 結果（2026-11-10 實跑，監工核准，上限 US$1.50）

10 張 FLUX schnell 生成圖（§6 五類各 2，存本機素材庫）× 3 方式（本機 SF3D 在操作者同意授權後同日補跑，`run-local.cjs`）。證據：`docs/s4b2-evidence/`（`contact-sheet.jpg` 每列＝原圖｜SPAR3D 正面／45°｜TRELLIS 正面／45°；`results.json` 每張面數、貼圖、秒數、費用；`run.cjs`、`analyze.cjs` 可重跑）。

| 方式 | 平均秒數 | 平均三角面 | 貼圖 | 10 張實扣 | 帳上記錄 | 品質（看拼圖） |
|---|---|---|---|---|---|---|
| **Stability SPAR3D（預設）** | 5.6 | 27,739 | 2 張 JPEG 1024² | US$0.40（餘額 1025→985 credits） | US$0.40 | 顏色、長相、金屬反光最貼原圖；模型面朝 glTF −Z |
| Replicate TRELLIS | 31.1 | 17,892 | 1 張 PNG 1024² | US$0.325（predict_time 232.5 s × US$0.0014） | US$0.38（舊：固定估價） | 幾何較銳利；整體偏暗、人臉走樣、金屬變霧面 |
| 本機 SF3D（RTX 5060，免費選項） | 17.4 | 21,893 | 2 張 JPEG 1024² | US$0 | US$0 | 顏色、長相接近 SPAR3D；透明玻璃杯被壓扁消失；面朝 glTF −Z；GPU 記憶體峰值 6.2 GB |
| 生圖 FLUX schnell | — | — | — | US$0.03（US$0.003 × 10） | 素材 origin | — |
| **合計** | | | | **約 US$0.755** | | |

理由：影片要的是「像原圖」（人物、商品），SPAR3D 每項都更貼原圖、快 5 倍、價差小；本機 SF3D 品質接近但透明物失敗，列為免費選項，線上預設維持 SPAR3D。

跟著修：TRELLIS 改按 `metrics.predict_time × TOOL_RATES["3d-trellis"].usdPerSec` 記帳（這次 10 筆照舊記 0.038，多記 US$0.055，未改歷史紀錄）；SPAR3D 模型面朝反向 → 方式表 `facing: 180`，自動綁骨預設轉 180°；SPAR3D 網格 bone heat 解不出（0／8606）→ 先焊接重複頂點，仍失敗就在體素重建副本上算權重再傳回（實跑 8606／8606，`docs/s4b2-evidence/spar3d-autorig-walk.png`）。
