# aware-wave.com 產品層資訊架構（Product Domain IA）

> **這份檔的用途**：`aware-wave.com` 底下每個子網域「是什麼、給誰用、現在有沒有」的單一對照表。來源：操作者 2026-08-29 貼出 GPT 建議的品牌 IA 圖 → 與 `AWAREWAVE_STACK_QUICKREF.md` 實查現況交叉核對後定案。
> **與其他文件的分工**：本檔只管「子網域職責 + 優先序」；`api.aware-wave.com` 的路由/版本細節見 [`PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md`](PLAN_PHASE1_API_AWARE_WAVE_NODE_EDGE.md)；DNS/TLS 實際設定見 [`../operations/CLOUDFLARE_HETZNER_PHASE1.md`](../operations/CLOUDFLARE_HETZNER_PHASE1.md)；`app.aware-wave.com` 現況見 [`../operations/APP_AWARE_WAVE_CURRENT_STATE.md`](../operations/APP_AWARE_WAVE_CURRENT_STATE.md)。

---

## 1. 現況（已驗證，2026-08-29）

> **⚠️ 主機現況（2026-08-29 訂正）**：舊 SG（`5.223.93.113`）/ EU（`204.168.175.41`）容器**已全部停用**。2026-08-28 起全部服務整併到單機 **`ks-aw-01`（`149.202.64.114`）**，host nginx 統一終結 TLS，各服務綁 `127.0.0.1:<port>`。下表「服務群」欄只保留**歷史容器分組**（原本設計上互相獨立的服務簇），不代表現在跑在不同機器——**都在 `ks-aw-01` 一台上**。SSOT：[`AWAREWAVE_STACK_QUICKREF.md`](../operations/AWAREWAVE_STACK_QUICKREF.md) 頂部橫幅。

| 子網域 | 角色 | 服務對象 | 狀態 | 主機 | 服務群（歷史分組） |
|---|---|---|---|---|---|
| `www` | 公司/品牌官網 | 公眾 | ✅ 已上線 | `ks-aw-01` | 原 SG（WordPress） |
| `api` | 對外統一 API gateway | 開發者/整合方 | ✅ 已上線 | `ks-aw-01` | 原 SG（node-api） |
| `app` | Lobster Factory **維運後台**（repair/inbox/provisioning/客戶管理）| AwareWave 自己人（owner/admin/operator/viewer）| ✅ 已上線 | `ks-aw-01` | 原 SG（next-admin） |
| `cognitive` | AI LEGO Cognitive Engineering OS | 產品使用者 | 🔵 架設中 | — | 待定 |
| `oracle` | 紫微斗數命理 app（內部專案）| 內部/測試 | ✅ 已上線（非公開品牌 IA）| `ks-aw-01` | 原 SG |
| `studio` / `supabase` | Supabase Studio / API | 內部維運 | ✅ 已上線 | `ks-aw-01` | 原 EU |
| `trigger` | Trigger.dev | 內部維運 | ✅ 已上線 | `ks-aw-01` | 原 EU |
| `n8n` | n8n 自動化 | 內部維運 | ✅ 已上線 | `ks-aw-01` | 原 EU |
| `postiz` | 社群發佈 | 內部維運 | ✅ 已上線 | `ks-aw-01` | 原 EU |
| `mainwp` | WP 多站管理 | 內部維運 | ✅ 已上線 | `ks-aw-01` | 原 EU |
| `uptime` | Uptime Kuma | 內部維運（public reachability 探測）| ✅ 已上線 | `ks-aw-01` | 原 EU |
| `remotion-svc` / `video-svc` | 影片生成服務 | 內部維運 | ✅ 已上線 | `ks-aw-01` | 原 EU |

> 內部維運那一批（`oracle`/`studio`/`trigger`/`n8n`/`postiz`/`mainwp`/`uptime`/`remotion-svc`/`video-svc`）**不進第 2 節的品牌 IA 圖**——它們是後台工具，不對外行銷，但盤 DNS/CF zone 時別漏算。
>
> **對 portal 設計的實際影響**：單機現實 = 資源有限（AGENTS.md 監控門檻對 `ks-aw-01` 特別嚴：記憶體/硬碟 60%），新增服務**每個 container 都是真成本**，不是可以隨便切分微服務的環境。這是 §3〈方案比較〉選「共用而非獨立」的額外理由，見 `PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md`。

---

## 2. 提案新增（GPT 2026-08-29 建議，操作者確認方向）

| 子網域 | 角色 | 服務對象 | 與現有子網域的關係 |
|---|---|---|---|
| `hci` | HCI-30（辨人 × 合作評估 × 關係情報 × 風險決策）| 產品使用者 | 全新產品，未動工 |
| `portal` | 統一登入 / Account / Subscription / Product Launcher | **HCI-30 + Cognitive OS 的外部客戶** | **跟 `app` 不同東西**（見下）——`app` 是內部 admin console（單一 owner + RBAC），`portal` 是外部多租戶客戶帳號/訂閱層，目前完全不存在 |
| `docs` | 技術文件（`/hci/` `/cognitive/` `/developers/`）| 開發者/使用者 | 新 |
| `trust` | Security / Privacy / Compliance | 企業客戶/採購 | 新，通常簽約才需要 |
| `status` | 服務健康 | 公眾 | 建議直接開放 `uptime.aware-wave.com`（已存在的 Uptime Kuma）對外 view，不必重建 |

---

## 3. 優先序（2026-08-29 定案）

**排序原則**：外殼（DNS/靜態頁）成本低可隨時補；`portal` 是骨頭——沒有它，HCI-30 跟 Cognitive OS 做完也收不了費、開不了帳號。

1. **`portal` 最小版**（先接 `cognitive` 一個產品即可）— bottleneck，優先
2. **`status`** — 不重建，`uptime.aware-wave.com` 開公開 view 即可
3. **`docs`** — 可跟產品開發同步長
4. **`trust`** — 等真的有客戶/採購問才做
5. **`hci`** — 子網域先保留，等 HCI-30 真的要上線再開

---

## 4. 下一步

- [ ] DNS 保留（Cloudflare CNAME placeholder，不含服務）：`hci` / `docs` / `trust` — **Medium risk（動 Cloudflare 帳號設定），需操作者 go-ahead**，見 `TASKS.md` §G
- [ ] `portal` 最小版設計/建置 — 見 `TASKS.md` §F
- [ ] `status` 開放 `uptime.aware-wave.com` 對外 view 或另建 CNAME 指向同一 Uptime Kuma — 見 `TASKS.md` §G
