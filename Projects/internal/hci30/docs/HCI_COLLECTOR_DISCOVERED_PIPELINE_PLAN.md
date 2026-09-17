# HCI-30 蒐集器→DISCOVERED 管線計畫（P9 Task Prompts）

> 來源：`planner` agent 產出，2026-09-17。對應 [`agency-os/docs/data-collection/DATA_COLLECTION_PLAN.md`](../../../agency-os/docs/data-collection/DATA_COLLECTION_PLAN.md) §3 C4（`sink/hci-discovered`，未動工）與 `agency-os/docs/architecture/decisions/011-collection-ingestion-boundary.md`。**本文件僅供審閱，非執行授權** — Task 0/1 為硬阻塞 STOP，見下方。

## 前置查證摘要（架構修正，優先閱讀）

使用者原始構想「把 `/ops/collect` 的輸出直接接進 HCI-30」與現存 ACCEPTED 決策衝突：`ADR-011 §決策15c`／`DATA_COLLECTION_PLAN.md:117` 明文「本系統的 `ctx.fetch`（跑在 next-admin process）不得用於 HCI 路徑」——原因是 `ctx.fetch` 與 Supabase／Trigger.dev／n8n 共用 docker bridge，正是 ADR-0029 要隔離掉的攻擊面。**正確解法**：沿用 `/ops/collect` 的**契約形狀**（`Target`/`RawDoc`/`CollectBlock` 語意、品質閘、trust 標記慣例）與 UI 殼（seed 註冊、dry-run-first 習慣），但**執行**落在全新、與 next-admin 分離的隔離 runner（ADR-0029，六道閘目前零程式碼）。下方任務已按此修正設計，不是字面上的「接線」。

其他查證發現：
- `hci.sources` 無 `source_ref` unique 約束；`hci.sources`/`hci.source_snapshots` **完全沒有 `admission_state` 欄位**——`DISCOVERED/MATCHED/VERIFIED/ACCEPTED/ACTIVE/REJECTED` 六態目前無處存放，「永不自動晉升」只是散文承諾，無機械閘。
- `hci.source_snapshots`（migration 0004）已存在且無條件 append-only、無 DELETE 授權；`hci.sources` 全 CRUD 但被 FK 擋刪。REJECTED 項目今天**技術上刪不掉**——保存期限問題升級成「先要新 schema 機制」的問題，見 Task 1。
- `hci.source_relationships` 已存在（ADR-0026 gate 1-2 已完成），但 `claim_id` 強制 FK 到 `subject_records(kind='CLAIM')`——DISCOVERED 階段沒有 Claim，這張表寫不進去。解決重複來源浪費在本管線只能做「候選提示」，正式接線要等未來 Claim-extraction wave。
- `hci.subject_records.subject_type` CHECK 死綁 `'PERSON'`，`hci.sources` 完全沒有 person/organization 欄位——「限組織實體」無法靠 schema 型別強制，只能靠 seed 登記時的人工屬性做機械守門（Task 6），不做自然人推論分類。
- ADR-0029 六道閘全部零程式碼，本計畫是第一次真的蓋；`Projects/internal/hci30/public-intelligence/` 目錄尚不存在。沒有為 HCI 準備的物件儲存服務，Trigger.dev 自身內部 MinIO 不可借用（會違反 ADR-0029 gate 2）。

## Definition of Done

`/ops/collect` 風格的操作介面能讓人為一個租戶登記「限組織實體」的 seed，觸發跑在網路隔離 runner 內的 fetch，其結果以 `admission_state='DISCOVERED'`（機械閘強制、無旁路）寫入 `hci.sources`/`hci.source_snapshots`，raw bytes 進物件儲存、Postgres 只存 hash+ref；ADR-0029 六道閘全綠；全程不產生 Evidence／Claim；人工可在審核佇列看到並標記 REJECTED；未經人工，系統無任何路徑能把 DISCOVERED 推進 MATCHED 以後的狀態。

## Risks

| 風險 | 可能性 | 影響 | 處置 |
|---|---|---|---|
| 誤把 `/ops/collect` 既有 `ctx.fetch` 接去打 HCI 目標 | M | H（違反 ADR-0029） | Task 6/7 明訂邊界：next-admin 端程式碼禁止呼叫任何會執行對外 fetch 的既有 `lib/collect` 函式；Task 13 靜態掃描驗證 |
| Seed 守門用 NLP/LLM 猜「是不是自然人」，猜錯即政策違規 | M | H | Task 6 改用機械可驗證的白名單屬性（人工勾選 `subject_kind=ORGANIZATION`，未勾一律拒收），不做推論式分類 |
| `hci.source_snapshots` 無刪除機制，REJECTED 保存期限決策落地不了 | H（已證實） | M | Task 1 先決定方向；若選「新建抹除機制」歸為新 ADR，本計畫只做「retain-forever + 狀態標記」路徑 |
| ADR-0029 隔離網路配置在 `ks-aw-01` 唯一主機上做錯 = 打穿共用 docker bridge | M | H（唯一主機無回退） | Task 3 先在本機/測試環境驗證四道網路閘，通過才排上 `ks-aw-01`；上機本身另需操作者明示 go-ahead |
| `source_relationships` 需要 Claim 才能寫，誤以為本管線就能完整解決重複來源 | H | M | Task 8 明確只做候選提示，不寫 `source_relationships`；Task 11 的算法修正與本管線是否上線解耦 |
| `classify-evidence-quality.mjs` 是通用模組，改壞回歸到 web-collection 以外的呼叫端 | M | M | Task 11 要求全量既有測試 + 新增 fallback 測試，`hits=0` 需 bughunt-oracle 驗證 |
| 兩題政策問題被默默視為已解決而動工 | H（已發生過一次） | H | Task 0/1 設為硬阻塞，不接受任何實作任務繞過 |

## Task 0：真人資料紅線覆核（STOP — 不指派給任何實作角色）

- **Goal**：操作者明確簽核「本計畫全程僅限組織實體，任何自然人研究對象一律排除」，並鎖死未來擴大範圍的觸發條件。
- **Scope**：本計畫全體任務（Task 2, 6-10）的執行授權邊界；不改任何檔案。
- **Input**：`ADR-011 §決策10`（hci30 側自動蒐集限組織實體、不含自然人，理由＝ADR-0018 gate 5 抹除生命週期未接線）；`ADR-0011-hci-subject-type-scope.md`（`subject_type` 結構上只認 PERSON）；`ADR-0010-consent-entity-scope.md`。
- **Output**：一份書面決策記錄（`agency-os/reports/decisions/`），至少含：(1) 重申組織-only 邊界維持有效；(2) 明列任何任務若要新增 person-linked seed／person_id 欄位／自然人查詢入口，必須先有新 ADR + 已建立的合法依據才可動工；(3) 誰有權簽核擴大範圍。
- **Acceptance**：操作者書面簽核存在；Task 6 的驗收條件引用本決策記錄路徑。
- **Boundaries**：不產出任何程式碼或 schema；不預先為「以後做真人版」預留欄位/型別。

## Task 1：REJECTED 保存期限與抹除機制決策 — dispatch to `decision-intelligence`（STOP，阻塞 Task 2）

- **Goal**：對「DISCOVERED/REJECTED 的 `hci.sources`/`hci.source_snapshots` 要保留多久、能不能刪」做出可執行決策。
- **Scope**：純決策文件，不動 schema。
- **Input**：`hci.source_snapshots` 無條件 append-only、無 DELETE 授權（migration 0004）；`hci.sources` 全 CRUD 但被 FK 擋刪；`ADR-0026` gate 3（`DSR-CLAIM-DELETE-01`）已知 BLOCKED；`ADR-0018` gate 5（`hci.record_erasure()`）Wave 4 未建。兩個可行選項：(A) REJECTED 僅標記狀態、retain-forever，列為已知未決債務；(B) 新 ADR + migration 建立專屬抹除原語（範圍超出本計畫，另立項）。
- **Output**：決策記錄選 A 或 B（或條件式：先 A、B 另立追蹤項），含觸發重新評估的條件。
- **Acceptance**：決策記錄存在且被 Task 2 的 migration 設計引用；若選 B，`agency-os/TASKS.md` 新增追蹤項並標明不在本計畫範圍。
- **Boundaries**：不得在無新 ADR 前提下讓 Task 2 私自發明抹除函式繞過 append-only 觸發器。

## Task 2：`hci.sources`/`hci.source_snapshots` migration — dispatch to `db-expert`（阻塞於 Task 1）

- **Goal**：補齊 DISCOVERED 自動蒐集所需的三個缺件：URL 冪等、機械化狀態機、raw-content 信任標記欄位。
- **Scope**：`Projects/internal/hci30/database/migrations/00NN_*`（執行前先確認最新編號避免撞號）；`database/tests/wave1-negative-tests.sql` 新增負向測試；`ERROR_CODE_REGISTRY.md` 註冊新錯誤碼。
- **Input**：Task 1 的保存期限決策；既有 pattern 範本——`hci.enforce_dsr_transition()`（狀態機 trigger 寫法）、`hci.require_identity_verification()`（跨列不變量寫法）、`hci.reject_update_delete()`（append-only trigger 慣例）；`epistemic-label.schema.yaml`（11 值 `epistemic_type` enum，只能引用不能新創詞彙）。
- **Output**：(a) `hci.sources` 加 `UNIQUE (tenant_id, source_ref)` + upsert function；(b) `hci.sources` 加 `admission_state` 欄位（`DISCOVERED/MATCHED/VERIFIED/ACCEPTED/ACTIVE/REJECTED`）+ `BEFORE INSERT OR UPDATE` trigger 只允許合法遷移，裸 UPDATE 對一般角色不開放，一律走限定函式；(c) `hci.source_snapshots` 加 provenance/trust 欄位（值域與 `hci.subject_records.epistemic_label` 的 CLAIM-only CHECK 分開設計，不可直接複製同名欄位）。
- **Acceptance**：`database/tests/00_test_harness.sql` 全綠；新增負向測試證明非法狀態遷移被拒、繞過限定函式的裸寫入被拒、`source_ref` 重複 upsert 不產生第二筆；`scripts/mutation-check-wave1.ps1` 通過；table-inventory drift 檢查更新。
- **Boundaries**：不動 `hci.subject_records`/`identity_candidates`/`identity_verifications`/`source_relationships` 的既有欄位或約束；不繞過 Task 1 尚未決定就自建刪除路徑。

## Task 3：隔離 fetch runner — 網路層（ADR-0029 gate 1-3） — **本機/測試環境已完成**（2026-09-17，`fullstack-engineer` + critic 覆審全修，real-Docker 驗證通過；上 `ks-aw-01` 仍需另一次明示 go-ahead，STOP）

- **完成狀態**：`infra/local/compose.fetch-runner.yml` + `infra/local/fetch-runner/`（Dockerfile + `server.mjs` 內部 API 骨架）+ `infra/local/network-guard/`（Dockerfile + `entrypoint.sh` iptables 政策）+ `tests/architecture/fetch-runner-network-isolation.test.ps1`。critic 覆審抓到 4 個 Major：(1) 原始 iptables 政策只涵蓋 IPv4，這台機器所屬 host class 已有先例栽在同一類 bug（`lobster-factory` Hetzner `cloudInit.ts` 的 IPv6-defaults-to-ACCEPT 教訓）——已修，`enable_ipv6: false` + `ip6tables` 預設全擋；(2) `runner` 沒有 `restart:` 設定本身就是安全不變量（network-guard 是 one-shot，重啟會讓 iptables 規則消失且無感知）——已修，加註解 + 機械化測試斷言；(3) `object-storage` 用 `bitnamilegacy/minio:latest` 浮動 tag，未來會裝真實抓取內容——已修，改用 digest 釘住；(4) network-guard 完成前 runner 就能接受連線的競態窗口——今天無害（尚無真實 fetch 呼叫），已在 `server.mjs` 註解標記為 Task 4/7 的硬性合併門檻。真跑驗證過程中另外自己抓到並修正 2 個測試腳本本身的 bug（PowerShell 對字串陣列用 `-notmatch` 是過濾語意不是布林值，導致一個斷言即使真的通過也會誤判失敗；`docker inspect` 查 IPv6 位址查錯欄位路徑，在自訂網路下該欄位不存在只會噴 template parse error 而非傳回空字串，讓斷言看似通過但其實什麼都沒驗證）。最終 real-Docker 全綠：8 個閘門斷言 + 4 個 API 斷言 + 3 個新增機械閘（restart policy／IPv6 位址／ip6tables 生效）全部通過，含對本機真實在跑的 `trigger-webapp`/`trigger-postgres` 容器做真實連線嘗試並確認被擋。細節見 WORKLOG 2026-09-17（續7）。
- **Goal**：建立與 Trigger.dev/next-admin 分離的獨立 compose service，滿足「無 docker bridge 路由」「egress 僅限公開網段」兩道機械可測閘門。
- **Scope**：新 compose service 定義（`Projects/internal/hci30/infra/local/compose.dev.yml` 或同層新檔，命名如 `hci-fetch-runner`）；對應網路/iptables 或 docker network 設定；最小內部 HTTP API 骨架（enqueue/status，供 Task 9 呼叫，鑑權用共享密鑰或 mTLS，不對外公開）；物件儲存服務的容器/連線 provisioning（新建，獨立於 Trigger.dev 內部 MinIO）。
- **Input**：`ADR-0029` gates 1-3；`07_SECURITY_PRIVACY_REVIEW.md` SEC-05 的 blast-radius 描述；`ks-aw-01` 唯一主機拓樸。
- **Output**：可執行的 compose 定義＋網路政策；`tests/architecture/fetch-runner-is-separate-service.test.*`；`wave6-no-bridge-route`／`wave6-metadata-and-rfc1918-blocked` 測試 id 對應的真實連線嘗試腳本與通過紀錄。
- **Acceptance**：從 runner 容器內連 Supabase admin endpoint／Trigger.dev 內部 endpoint／n8n webhook 管理 endpoint 三者皆連線失敗；連 `169.254.169.254`、RFC1918、loopback、link-local 皆連線失敗；連公開網際網路正常。
- **Boundaries**：不修改 Trigger.dev 既有 service 定義本身的網路存取；不觸碰 `ks-aw-01` 上其他正在跑的服務；正式上機前需操作者對「prod 網路拓樸變更」明示批准。

## Task 4：DNS-rebind 防護 + SSRF payload corpus（ADR-0029 gate 4-5） — **本機/測試環境已完成**（2026-09-17，`fullstack-engineer` + critic 覆審修 1 Critical/2 Major，真實驗證通過；未寫入 `server.mjs`，留給 Task 7）

- **Goal**：runner 對外請求前解析並釘住目標 IP，連線時重驗，且能擋下已知 SSRF 手法。
- **Scope**：實際落地在 `infra/local/fetch-runner/net/`（非原計畫 `public-intelligence/retrieval/`——這批程式碼要被 Dockerfile `COPY` 進 runner image，必須落在 Docker build context 內，即 Dockerfile 所在目錄下；`public-intelligence/` 目前整個尚未建立）。
- **Input**：`lobster-factory` `net/fetcher.ts` 用 `undici.Agent({connect:{lookup}})` 把連線釘死在驗證過位址的既有手法（同一手法可搬過來，但程式碼本身不可共用 import——兩側是隔離邊界）；ADR-0029 gate 4/5 原文。
- **Output**：`net/ssrf-guard.mjs`（`checkUrl`/`isPrivateAddress`/`SsrfBlockedError`）+ `net/pinned-http-client.mjs`（`pinnedLookup`/`createPinnedAgent`/`defaultTransport`/`createSafeFetch`）+ 3 個測試檔（`ssrf-guard.test.mjs`/`pinned-http-client.test.mjs`/`ssrf-payload-corpus.test.mjs`，共 23 個測試）；`wave6-dns-rebind-rejected`、`wave6-ssrf-payload-corpus` 測試 id 皆有對應測試。
- **完成狀態**：原始程式碼由前一個 session 的 `fullstack-engineer` agent 寫完，但該 agent 整個 session Bash 工具壞掉（同一 wrapper bug 導致零執行），程式碼從未跑過、未 commit。本 session 重新真實執行：(1) 修一個立即讓 `ssrf-payload-corpus.test.mjs` 炸掉的 bug——`pinned-http-client.mjs` 從 `ssrf-guard.mjs` import 了 `SsrfBlockedError` 卻沒有 re-export，消費者拿不到；(2) critic 覆審抓到 1 個 Critical + 2 個 Major：**Critical**——`defaultTransport` 的位元組上限截斷邏輯呼叫 `res.destroy()` 後還在等 `'end'` 事件才 resolve，但 `destroy()` 在讀取中的回應上只會觸發 `'close'`，永遠不會有 `'end'`，導致 Promise 永遠不 resolve（真實 repro：42KB body 對 3KB cap，掛住超過 10 秒不 settle，`finally` 裡的 `agent.destroy()` 也連帶跑不到，形成 socket 洩漏）——已修，改成在截斷當下立即 resolve，不等 `'end'`；**Major 1**——只有 idle timeout（每收到一個位元組就重置），沒有絕對 wall-clock 上限，慢速滴水攻擊可以無限期占用連線——已修，加 `deadlineMs`（預設 120s）用獨立 timer 強制斷線；**Major 2**——`object-storage-client.mjs` 的讀取路徑 `parseSnapshotRef` 對 `key` 沒有格式驗證，理論上能接受 `../` 之類的字串構成路徑穿越（寫入路徑本來就安全，因為 key 永遠是程式算出來的 sha256，這裡是讀取路徑的防禦缺口）——已修，讀取前驗證 `key` 必須符合 `^sha256\/[0-9a-f]{64}$`。修完加一個新測試直接證明截斷不再掛住（真實 socket，4096 bytes body vs 1024 byte cap，2.75ms 內 resolve）。2 個 Minor（`::ffff:` 正規表示式在 URL-derived hostname 上永遠命中前面分支使其變死碼；trailing-dot FQDN 略過字串快速路徑但仍被後續真實 DNS 解析擋下，安全結論不變）與 `lobster-factory` 對應檔案共用同一行為，非本次引入的回歸，留待兩側協調修，不在本次單邊改。詳見 WORKLOG 2026-09-17。
- **Acceptance**：控制用測試網域在解析與連線間切換公開 IP／RFC1918 IP，連線被拒；corpus 內每個已知手法皆 fail-closed；測試對象僅限受控/合成目標。
- **Boundaries**：不得對真實第三方網站執行 SSRF payload 測試；不得使用真人或真實客戶資料作為測試內容。

## Task 5：物件儲存 client 端寫入路徑 — **本機/測試環境已完成**（2026-09-17，`fullstack-engineer` + critic 覆審，real-Docker/MinIO 驗證通過）

- **Goal**：raw HTML/text 進物件儲存，Postgres 只存 hash+ref。
- **Scope**：實際落地在 `infra/local/fetch-runner/object-storage-client.mjs`（非原計畫 `public-intelligence/source-registry/`——同 Task 4，理由是 Docker build context 邊界；`public-intelligence/` 尚未建立）。
- **Input**：raw content 不得進 Postgres text/bytea（`06_HCI30_PUBLIC_INTELLIGENCE.md:300-302`）；Task 3 provisioning 的物件儲存端點/憑證；`hci.source_snapshots.content_hash`/`snapshot_ref` 欄位形狀（opaque 指標設計）。
- **Output**：content-addressed 寫入函式（`sha256(bytes)` 為鍵，SigV4 簽章直連 MinIO，無需額外 npm 依賴）；單次位元組上限與逾時；回傳 `{content_hash, snapshot_ref}` 供 Task 8 寫入 DB；`tests/architecture/fetch-runner-object-storage-write-path.test.ps1`（沿用 Task 3 的 fresh-project-name + 產生 secrets 模式，對真實 MinIO 驗證）。
- **完成狀態**：與 Task 4 同一個壞掉的 session 寫的，同樣零執行未 commit。本 session 真實跑 real-Docker 測試時抓到並修一個腳本本身的 bug——`[System.Security.Cryptography.RandomNumberGenerator]::Fill()` 是 .NET 5+ 才有的靜態方法，這台機器的 Windows PowerShell 5.1（.NET Framework）沒有這個多載，跑下去直接 `MethodNotFound`——改用 `RNGCryptoServiceProvider.GetBytes()`（兩邊都能跑）。critic 覆審抓到的讀取路徑 key 格式驗證缺口記在 Task 4 條目（`parseSnapshotRef` 在同一個 commit 一起修）。最終 real-Docker 全綠：合成內容真實寫入→讀回位元組相同；超過 1024 byte cap 的 2048 byte payload 被拒絕（exit 3）且該 content-addressed key 在 MinIO 裡確實不存在（無殘留半成品）。Task 3 的網路隔離測試在 compose/Dockerfile 改動後重跑仍全綠，無回歸。詳見 WORKLOG 2026-09-17。
- **Acceptance**：真實寫入一份合成內容、讀回位元組相同；超過位元組上限的輸入被拒絕而非截斷靜默通過。
- **Boundaries**：不寫入 Postgres 任何 raw bytes 欄位；不建立跨租戶共用的 dedup（ADR-0026 僅允許 bytes 層可選 dedup 且不得掛 tenant_id/FK——本任務不做這個可選優化，避免範圍蔓延）。

## Task 6：Seed 治理 — 組織實體白名單守門（阻塞於 Task 0） — **已完成**（2026-09-17，real-Docker 驗證通過）

- **Goal**：機械化強制「只有標記為組織實體的 seed 才能被 runner 接受」，不做自然人推論分類。
- **Scope**：實際落地在 `infra/local/fetch-runner/server.mjs` 的 `/enqueue` handler——這是今天 seed 進 runner 的唯一入口（Task 9/10 尚未建，UI/Trigger.dev 層目前都還不存在），不是獨立新目錄。
- **Input**：Task 0 的簽核決策記錄（`agency-os/reports/decisions/2026-09-17-hci30-c6-and-collector-task1-decisions.md` 裁決3）；`ADR-011 §決策10` 原文。
- **Output**：`subject_kind !== 'ORGANIZATION'` 嚴格相等檢查（無 NLP/LLM）；缺欄位/型別混淆/大小寫誤填皆同一律 400；`job.subjectKind` 硬編字面值不回顯輸入，避免未來檢查邏輯放寬時悄悄脫鉤。
- **完成狀態**：critic 覆審抓到 1 個 Major——`body` 為 JSON literal `null` 時 `body.targetUrl` 直接拋 TypeError，在 `http.createServer` 不 await 的 async handler 內形成 unhandled rejection，Node 20 預設行為讓整個 process 崩潰（這個 container 依 Task 3 的安全不變量刻意不設 restart policy，代表崩潰是全面停機直到人工介入）。這個洞在 Task 6 加入前就存在（`targetUrl` 檢查本來就沒有 body 型別守衛），Task 6 的新檢查只是緊接在同一段未防護路徑後面。已修：body 型別守衛（拒絕 null/array/非物件）+ 整個 request handler 包 try/catch 當縱深防禦，任何未來類似解引用錯誤降級成 500 而非 process 崩潰。真跑 real-Docker 驗證：6 個新斷言全綠（缺欄位 400／`PERSON` 400／小寫誤填 400／陣列型別混淆 400／null body 400 且不崩潰／崩潰測試後 `/healthz` 仍 200 證明伺服器活著）+ 既有全部斷言無回歸。詳見 WORKLOG 2026-09-17（續11）。
- **Acceptance**：缺 `subject_kind` 的 seed 呼叫 enqueue 回 4xx；帶 `subject_kind='PERSON'`（若誤填）同樣被拒且有明確錯誤訊息；真實跑一次組織 seed 成功排入。
- **Boundaries**：不新增任何允許自然人 seed 通過的旁路參數；不在此任務嘗試「以後升級成自動判斷」的擴充點。

## Task 7：Runner 端 fetch + extract + 不可信內容隔離 — **已完成**（2026-09-17，critic 覆審 3 Major 全修，real-Docker 驗證通過）

- **Goal**：在隔離 runner 內執行最小可用的抓取＋抽取，並把抓到的每一段文字標記為不可信、掃描指令樣態。
- **Scope**：實際落地在 `infra/local/fetch-runner/retrieval/` + `content-isolation/`（同 Task 4/5，非原計畫 `public-intelligence/`，因 Docker build context 邊界；不 import 任何 `lobster-factory/lib/collect/*` 模組——僅 `collect/http-html.ts` 的抽取手法作介面靈感，程式碼獨立重寫）。
- **Input**：最小抓取集比照 `/ops/collect` 的 `collect/http-html` 語意重新實作（`Target`/`RawDoc` 形狀作介面靈感，程式碼不共用）；`ADR-011 §決策15b`；威脅類別引用 `Projects/internal/hci30/security/threat-models/TM_PUBLIC_INTELLIGENCE.md`（指向 AI LEGO `SECURITY_THREAT_MODEL.md` TB-1/T2/E4，機制在本任務新建）。
- **Output**：`net/ssrf-guard.mjs`/`pinned-http-client.mjs`（Task 4）之上的 `retrieval/http-html-fetch.mjs`（`fetchAndExtract(url) → {text, raw, contentHash, title, scanSurface, content_provenance, ...}`）+ `content-isolation/scan.mjs`（`scanForInstructionLikeContent`）+ `server.mjs` 的 `processJob` 狀態機（fetching→completed/flagged_for_review/failed）。`content_provenance = {epistemic_type:'EVIDENCE', authorship_state:'SOURCE_QUOTATION'}`；`authorship_state` 明確只存在於記憶體/人工審核用途，絕不寫入任何 `hci.*` 資料表（migration 0010/0020 已明文保留該欄位名、無 ADR 授權建欄，Task 8 必須遵守）。掃描面覆蓋 `text`+`title`+HTML 註解/常見屬性值（`extractScanSurface`），命中即 `status='flagged_for_review'`，不進 Task 8 寫入路徑。
- **完成狀態**：本輪第一個從零全新任務（Task 4/5/6 皆為救回/擴充前一個壞掉 session 的產物）。真跑測試過程中自抓 2 個真實 bug：(1) `/enqueue` 原本直接呼叫 `processJob(job)`——async function 主體同步執行到第一個 `await` 為止，`job.status='fetching'`（`processJob` 第一行）會在 `/enqueue` 回應序列化前就已寫入，破壞「回應永遠是 `queued`」的文件承諾（real-Docker 測試對 `https://example.com/` 這種秒回目標時現形）→ 已修，改用 `setImmediate` 延後整個呼叫（含同步前綴）到下一個 event loop tick；(2) `SsrfBlockedError` 建構子自己已把 reason 包成 `ssrf_blocked_<reason>` 格式的 `.message`，`processJob` 誤判為裸 reason 又包一次，變成雙重前綴（被自己寫的單元測試抓到）→ 已修，直接用 `err.message`。critic 覆審抓到 3 個 Major 全修：**Major**——只掃 `text` 沒掃 `title`，含注入內容的 `<title>` 能頂著進 `completed`（title 明明是本任務宣告的輸出欄位之一）→ 已修，`extractScanSurface()` 另外抽出 HTML 註解＋常見屬性值（`alt`/`content`/`aria-label`/`placeholder`），組成 `scanSurface = title+text+scanSurface` 統一掃描，同時關掉「這些內容仍完整存在 `raw`（將被持久化+雜湊）卻對掃描隱形」的相關缺口；**Major**——network-guard 的 ready-file 放在具名持久化 Docker volume 且只空 `touch`，`runner` 重啟（network-guard one-shot 不重跑）會讓舊 ready-file 被誤判為當下有效＝全開放 egress+假 ready 訊號→ 已修雙重防線（`network-guard` 每次寫入新 UUID + `runner` 的 Dockerfile CMD 在 node 啟動前先刪除），real-Docker 回歸測試直接複現「重啟＋ready-file 過期」情境並驗證 fail-closed（`status=failed, error=network_guard_not_ready_after_*ms`）；**Major**——`LONG_BASE64_RUN` 比對原始文字，一般 HTML 換行排版（如 `<pre>` 區塊）就能免費繞過整個「異常長 base64」訊號，不需任何規避手法→ 已修先去空白再比對。另修 2 個 Minor（content-type 檢查改錨定實際 media-type token；`raw.toString('utf8')` 改讀 `Content-Type` 的 `charset` 參數，未知/缺省退回 utf-8）。50 個新單元測試 + 1 個新 real-Docker 架構測試（`tests/architecture/fetch-runner-content-isolation.test.ps1`）全綠，Task 3/5 既有架構測試重跑無回歸。已知限制記入 TASKS.md：`jobs` Map 無 TTL，Task 9 接真實流量前須處理。詳見 WORKLOG 2026-09-17（續13）。
- **Acceptance**：真實餵一份含 `ignore previous instructions` + 零寬字元的 HTML，驗證該筆不進入 DISCOVERED 寫入、改落人工佇列（在新 runner 上重做一次，不可只信任舊環境的測試涵蓋新程式碼）——`tests/unit/fetch-runner/server.test.mjs` 逐字重現本驗收標準，並額外驗證「乾淨內文＋中毒 title」單獨也會觸發。
- **Boundaries**：不呼叫任何 next-admin 的既有 `lib/collect` 函式；不做 evidence-quality 判斷（那是 hci30 既有 `HCI_EVIDENCE_QUALITY_SPEC.md` 的地盤）。

## Task 8：`sink/hci-discovered` 寫入路徑 — **已完成**（2026-09-18，critic 覆審 2 Major 全修，real-Postgres 驗證通過）

- **Goal**：把 runner 的抓取結果落地成 `hci.sources`/`hci.source_snapshots` 的 DISCOVERED 列，不產生 Evidence，不做 record-level 去重。
- **Scope**：`Projects/internal/hci30/public-intelligence/source-registry/`——這次真的落在原計畫路徑（不同於 Task 4/5/7：這條寫入路徑需要真實 Postgres 存取，而 ADR-0029 gate 2 刻意切斷隔離 runner 對 docker-internal bridge（Postgres 所在網路）的路由，所以本任務**不能**跑進 runner 的 Docker build context，Task 4/5/7 的「搬家」理由在此不適用）。
- **Input**：Task 2 的 upsert function + admission_state 限定函式；Task 5 的物件儲存回傳值形狀（`{content_hash, snapshot_ref}`）；Task 7 的抓取輸出（`content_provenance.epistemic_type`）；ADR-0026（禁止 record-level 去重，即使同租戶同 URL 重抓也各自一筆 snapshot）。
- **Output**：`sink-hci-discovered.mjs`（`writeDiscoveredSource(query, input)`，`query` 依賴注入、零 npm 依賴，呼叫端——今天是 `app/scripts/verify-sink-hci-discovered.mjs`，未來是 Task 9 的 Trigger.dev task 或 `app/server.mjs`——負責真正的 Postgres 連線與 `SET ROLE` 租戶範圍）：`hci.sources` upsert（by source_ref，用 `hci.upsert_discovered_source()` 回傳值當 FK，不是本地生成的候選 id）；`hci.source_snapshots` 一律 INSERT 新列（append-only）；候選提示計算（同 origin 的其他 sources，非權威，只回傳不持久化，不寫入 `hci.source_relationships`）。
- **完成狀態**：critic 覆審抓到 2 個 Major 全修：**Major**——候選提示查詢原本用 `source_ref LIKE $1`，bound parameter 擋得住 SQL injection 但擋不住參數值本身含字面 `_` 被 Postgres 當萬用字元解讀（WHATWG URL host parsing 合法允許 hostname 含底線）——`my_test.example.com/%` 會連帶命中 `myXtest.example.com/...`，把不相關組織誤判成候選來源，直接違反這功能自己宣告的「same origin, non-authoritative」承諾。已修：改用 `starts_with(source_ref, $1)` 純字首比對，真跑 Postgres 15.8 確認正確；**Major**——候選提示這步是明訂的非權威步驟，卻沒 fail-soft：只有「URL 解析失敗」有防護，實際下查詢那段完全沒包，一旦失敗會讓已經真實 COMMIT 的兩個權威寫入被回報成整體失敗，重試會對同一 URL 產生多餘重複 snapshot（append-only 非冪等）——已修全段包 try/catch，任何失敗降級成空陣列。另補一個測試涵蓋缺口：本任務 8 個新單元測試 + Task 3-7 全部 `tests/unit/fetch-runner/**`（6 個檔案）都沒接進本專案唯一的「跑全部」入口 `scripts/test-wave1-local.ps1`——已修全部接入並真跑整個 20-migration 套用+可逆性檢查確認無回歸。過程中順手修一個真實 bug：`scripts/dev-db-init.ps1` 的 loop bound 停在 19、「已套用」判斷還在查 migration 0019 的 marker，代表全新 volume 上 migration 0020 永遠不會被套用（這台機器既有的 persistent dev DB 是被手動套上的，症狀還沒現形）——已修 loop bound 改 20、marker 改查 0020 自己的欄位。詳見 WORKLOG 2026-09-18。
- **Acceptance**：真實跑一次組織 seed，`hci.sources`/`hci.source_snapshots` 各出現預期列數；`admission_state` 恆為 DISCOVERED；同一 URL 重抓兩次，`hci.sources` 不增生第二筆，`hci.source_snapshots` 增生兩筆；候選提示不出現在 `hci.source_relationships` 任何列——`tests/architecture/sink-hci-discovered-write-path.test.ps1` 對真實拋棄式 Postgres 全部驗證通過。
- **Boundaries**：不建立任何 Claim／Evidence／Assessment 列；不寫 `hci.identity_candidates`/`identity_verifications`（人工晉升時的事）；不做跨租戶去重。

## Task 9：Trigger.dev 編排層（enqueue/status/retry-only，ADR-0029 gate 6） — dispatch to `fullstack-engineer`（依賴 Task 7、8）

- **Goal**：Trigger.dev 只負責排程/重試/可觀測性，實際 fetch 全部委派給隔離 runner 的內部 API。
- **Scope**：`Projects/internal/hci30/public-intelligence/`（Trigger.dev task 定義）。
- **Input**：耐久編排歸屬 Trigger.dev（ADR 004）；Task 3 的 runner 內部 API；ADR-0029 gate 6（task 程式碼只能呼叫 runner 自己的 API，不能有任何對外 HTTP client 呼叫非白名單目標）。
- **Output**：enqueue/status/retry task；靜態分析/架構檢查腳本，掃描本目錄下 Trigger.dev task 原始碼，若出現對非白名單目標的 HTTP client 呼叫即 build 失敗（測試 id `wave6-trigger-no-direct-fetch`）。
- **Acceptance**：真跑一次 enqueue → Trigger.dev dashboard 顯示 status 變化 → runner 端完成 → 結果經 Task 8 落地；靜態檢查對「刻意塞一行直接 fetch」的測試樣本能抓到（突變測試）。
- **Boundaries**：不在 Trigger.dev task 內 import 任何會發起對外 HTTP 請求的函式庫；不影響既有 `collect-scheduled-crawl` task（C3，已上線）。

## Task 10：操作介面 — 組織 seed 註冊 + DISCOVERED 審核佇列 — dispatch to `fullstack-engineer`（依賴 Task 2、6、9）

- **Goal**：延伸 `/ops/collect` 的 UI 慣例，讓人能登記組織 seed、觸發跑一次、看到 DISCOVERED 清單並標記 REJECTED。
- **Scope**：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/collect/`（新增子分頁或延伸既有 `CollectionSourcesPanel.tsx` 的 pattern，不修改既有 collect/sink 邏輯本身）。
- **Input**：Task 6 的 seed 屬性契約；Task 9 的 enqueue API；Task 2 的 admission_state 限定函式（供「標記 REJECTED」呼叫）。
- **Output**：新 UI 區塊：seed 登記表單（含必填 `subject_kind='ORGANIZATION'`）、dry-run 優先、DISCOVERED 清單（依租戶篩選）、REJECTED 標記按鈕（呼叫 Task 2 的限定函式，不允許裸 SQL）。
- **Acceptance**：UI 端到端跑一次：登記 seed → dry-run 看到候選 → 正式跑 → 清單出現 DISCOVERED 列 → 標記 REJECTED → 狀態轉換成功且非法轉換被拒。
- **Boundaries**：此 UI 的伺服器端程式碼不得直接呼叫任何會執行對外 fetch 的函式（next-admin process 不得執行 HCI 目標的 fetch，只能呼叫 Task 9 的 enqueue API）；不在此頁面之外新增其他導覽入口。

## Task 11：`classify-evidence-quality.mjs` 聚類根計數修正 — dispatch to `fullstack-engineer`（獨立並行，不依賴 Task 2-10）

- **Goal**：把「幾個獨立來源佐證」的計數基礎，從 raw `evidence_refs` 改成 `original_source` 聚類根，且無 `source_relationships` 資料時強制退回現行行為。
- **Scope**：`Projects/internal/hci30/packages/intelligence/classify-evidence-quality.mjs`；對應 `tests/unit/intelligence/`。
- **Input**：現行實作（`new Set(entry.evidence_refs).size`）；`06_HCI30_PUBLIC_INTELLIGENCE.md:181`（source-independence 需接進 Model Agreement 信心指標）；`hci.source_relationships` 表結構。明確範圍界線：本任務不依賴本管線（Task 2-10）是否上線——`source_relationships` 表已存在，用合成 fixture 資料即可驗證聚類邏輯；本管線本身不會產生 `source_relationships` 列（見 Task 8 boundaries），真正接上生產資料要等未來 Claim-extraction wave。
- **Output**：新算法：若某 dimension 的 `evidence_refs` 對應的 Claim 有 `source_relationships` 列可查，按 `original_source` 聚類根去重計數；若查無任何列（含全系統尚未產生任何列的現況），強制退回現行 distinct-ref-string 行為。
- **Acceptance**：既有呼叫端（非 web-collection 來源的 Assessment dimension）全部既有測試維持綠燈（零回歸）；新增 fixture 證明「50 個 URL、實為 3 個獨立來源」時聚類後計數為 3；`source_relationships` 為空時輸出與修改前逐位元組相同。
- **Boundaries**：不修改 `evidence-refs.mjs`／`combine-dimension-sources.mjs` 等上游模組的既有介面；不在此任務裡構造假的 `source_relationships` 資料寫入真實 DB。

## Task 12：Routing 三件套同步（若 Task 9/10 開出新 `/api/*`） — dispatch to `fullstack-engineer`（依賴 Task 9、10）

- **Goal**：任何新對外/內部 API 路由三件套同 PR 更新。
- **Scope**：`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` + `workflow-risk-matrix.json` + `lobster-factory/docs/ROUTING_MATRIX.md`。
- **Input**：Task 9（Trigger.dev enqueue）、Task 10（UI 背後 API）實際開出的路由清單。
- **Output**：三檔同步更新的單一 PR。
- **Acceptance**：既有 routing 一致性檢查腳本（若有）通過；三檔內容互相一致。
- **Boundaries**：不新增與本計畫無關的路由項目。

## Task 13：ADR-0029 六道閘收斂驗證 — dispatch to `vuln-verifier`（依賴 Task 3、4、6、7、8、9）

- **Goal**：以攻擊者視角對隔離 runner 實際發動 PoC 等級的嘗試，確認四道網路閘與 SSRF/DNS-rebind 防護真的擋得住，作為 Gate C 收斂前的獨立確認。
- **Scope**：只讀操作 + 對隔離 runner 的受控攻擊嘗試，不改動任何程式碼。
- **Input**：Task 3/4 的六個測試 id（`fetch-runner-is-separate-service`、`wave6-no-bridge-route`、`-metadata-and-rfc1918-blocked`、`-dns-rebind-rejected`、`-ssrf-payload-corpus`、`-trigger-no-direct-fetch`）與其通過紀錄。
- **Output**：一份獨立驗證報告，逐項複現或補測 Task 3/4 聲稱的通過結果，附實際指令與輸出。
- **Acceptance**：六項全部由 `vuln-verifier` 獨立復現為綠燈；任一項復現失敗則整個管線視為未完成，退回對應任務。
- **Boundaries**：不對 `ks-aw-01` 上其他正在服務生產流量的容器發動任何攻擊嘗試；僅限本計畫新建的隔離 runner 與受控測試目標。

## Execution Order

- **Day 0（並行）**：Task 0、Task 1、Task 3（起步：compose 骨架）、Task 11（完全獨立）。
- **Task 1 完成後**：Task 2 開工。
- **Task 3 完成後**：Task 4、Task 5（物件儲存 provisioning 跟 Task 3 走）並行。
- **Task 0 完成後**：Task 6 開工（可與 Task 2/3/4/5 並行）。
- **Task 4 + Task 6 完成後**：Task 7 開工。
- **Task 2 + Task 5 + Task 7 完成後**：Task 8 開工。
- **Task 7 + Task 8 完成後**：Task 9 開工。
- **Task 2 + Task 6 + Task 9 完成後**：Task 10 開工。
- **Task 9 + Task 10 完成後**：Task 12。
- **Task 3 + Task 4 + Task 6 + Task 7 + Task 8 + Task 9 全部完成後**：Task 13（收斂驗證）。
- **關鍵路徑**：Task 0 → 6 → 7 → 8 → 9 → 10 → 12 → 13（8 步）；Task 1→2 與 Task 3→4→5 為餵入分支，需在 Task 7/8 前完成，不拉長主鏈。
- **Task 11** 全程可獨立並行，不影響關鍵路徑。

## Rollback Plan

- Task 2 失敗／驗不過：down migration（跟隨既有 `00NN_..._down.sql` 慣例），`hci.sources`/`source_snapshots` 恢復無 admission_state 狀態，本管線整體不可用但 C0-C3 不受影響。
- Task 3-5 失敗：整組隔離 runner 是新 compose service，直接 `docker compose down` 該 service，不影響既有 Trigger.dev/next-admin/n8n。
- Task 6-10 任一失敗：新目錄/新 UI 分頁可直接刪除或停用（未接生產流量前零風險）；`/ops/collect` 既有功能全程不受觸碰。
- Task 13 復現失敗：判定 Gate C 未達標，退回對應任務重做，不得降低閘門標準或跳過複測讓 Gate C 假性收斂。

## Done Criteria

- [ ] Task 0、Task 1 兩項 STOP 均取得操作者明示決策，未取得前 Task 2/6 及其下游一律不得動工
- [ ] 所有實作任務（Task 2-10, 12）各自通過 REALTEST_EVIDENCE + REVIEW_DONE + BUGHUNT_DONE + WORKLOG 四動作
- [ ] Task 13 獨立復現 ADR-0029 六道閘全綠
- [ ] `ADR_INDEX.md` 中 ADR-0029 狀態由「SPECIFIED — RUNTIME OPEN」更新為對應的已驗證狀態
- [ ] `DATA_COLLECTION_PLAN.md` §3 的 C4 列由未完成更新為完成並附證據連結
- [ ] 已知債務（Task 1 選 A 時的 REJECTED retain-forever、`source_relationships` 完整接線延後到 Claim-extraction wave）寫入 `agency-os/TASKS.md`

## 相關檔案路徑

- `agency-os/docs/architecture/decisions/011-collection-ingestion-boundary.md`
- `agency-os/docs/data-collection/DATA_COLLECTION_PLAN.md`
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/ADR-0029-isolated-fetch-worker-not-trigger-dev.md`
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/ADR-0026-claim-source-tenant-ownership.md`
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/ADR-0011-hci-subject-type-scope.md`
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/ADR-0015-restricted-subject-identity-confirmation.md`
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/06_HCI30_PUBLIC_INTELLIGENCE.md`
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/17_REPOSITORY_LAYOUT_AND_PATHS.md`
- `Projects/internal/hci30/database/migrations/0001_wave1_synthetic_up.sql`
- `Projects/internal/hci30/database/migrations/0004_wave1_source_provenance_up.sql`
- `Projects/internal/hci30/database/migrations/0010_wave1_epistemic_label_up.sql`
- `Projects/internal/hci30/packages/intelligence/classify-evidence-quality.mjs`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/collect/page.tsx`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/`（`sinks/`、`collectors/`、`orchestrator.ts` 等）
