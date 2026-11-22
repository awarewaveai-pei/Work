# SF-H 建站的主機步驟（步驟內容接上骨架）

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §0（I1–I6）、§1-3、§2、§3 的 SF-H 列（`:137`）。`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`，`INFRA`＝`lobster-factory/infra/hetzner-phase1-core`。整檔讀：`NA/lib/site-flow/{types,engine,gate-client,records,create-site,page-model}.ts`、`NA/app/api/ops/site-flow/` 三支 route、`INFRA/scripts/aw-hosting-gate.sh`（動詞、參數、輸出格式以這支為準）、`NA/lib/wp-plugin-stack-catalog.ts`。模型 Opus 5.5（完成後 `critic` Deep）。

## 目的
骨架（SF-G）、主機動詞（SF-E、SF-E2）、頁面（SF-J）都在 main 了，但步驟登記表 `SITE_STEP_DEFINITIONS` 是空的，頁面九步全顯示「尚未提供」。本卡填入主機那幾步的內容，讓操作者能從頁面把一個站建到「可開放」。

## 要做
照 SITE-FLOW `:137`，一項不少：`NA/lib/site-flow/steps/{preflight, container, wp-install, vhost, open, manual-checks}.ts` 並登記進步驟表；`ingress=product-gateway` 時 vhost 步驟為手動勾選；管理員密碼只在該次回應回傳一次、不寫 Vault、不寫 run output；`wp-plugin-stack-catalog.ts` 加 `installSource: "release-url"` 的自有外掛列與白名單，並修掉佈景 `kadence` 被當外掛的問題（該檔 `kadence` 那一列）。

另加第一到第三批 RISKS 帶進來的（每項要有測試）：
1. `gate-client.ts` 對齊閘門現況：docker 站的 `wp()` 不得送 stdin（閘門對任何 stdin 回 126）；`create()` 要送 ingress 參數（`host-vhost`｜`product-gateway`；後者只有主機開關檔 `AW_SITE_GATEWAY_SLUGS` 列出的 slug 才被接受，被拒時把原因顯示給操作者）；`install` 要送操作者 email（60 字內）與語系。
2. 安裝 WordPress 可能超過 90 秒（`gate-client.ts` 的 `GATE_TIMEOUT_MS`）。讓這一步不被連線時限切斷：若閘門的 `site-wp install` 是同步的，回報需要閘門改成背景 job 的話停下回報（不自己改 `aw-hosting-gate.sh`）；可行的做法是引擎端把這一步當作「送出後輪詢觀測結果」。裝到一半失敗、密碼沒拿到時，頁面提供「重設管理員密碼」（閘門已有 `reset-admin-password`）。
3. 環境狀態：`records.setEnvironmentStatus` 目前只能把狀態從 `provisioning` 移出，失敗後重跑成功回不到 `ready`。訂出狀態欄的規則並改 `records.ts`：狀態是觀測結果的快取，允許的轉換明列（含 `failed → provisioning → ready`），不允許的轉換拒絕；既有三個呼叫端行為不變（舊資料測試）。
4. 步驟狀態查詢改成一次主機呼叫：`site-preflight` 已回傳容器、volume、登記檔、vhost、憑證的整體狀況，各步驟的觀測函式共用同一次結果，不各開一條 SSH。
5. 安裝外掛那一步自動寫入外掛設定「引擎網址（伺服器用）」（oracle 外掛在容器內連不到自己的公開網址）。只在裝了 `oracle-wp-plugin` 的站做；值由步驟輸入帶入，不寫死網域。
6. 部分成功不得顯示完成：每步的觀測函式要驗到該步真正的結果（例如外掛步驟要逐一確認外掛已啟用），不是只看指令結束碼。
7. 頁面缺的兩步：第 4 步「每日備份」用觀測呈現（登記檔存在＝已列入當晚備份；有最近一次備份時間就顯示）；第 8 步「手動項目」＝`manual-checks`，勾選結果要存、要顯示是誰在何時勾的。
8. SF-J 留下的小項，一併處理：「需先完成：create」改顯示步驟名稱；讀取中與讀取失敗不得顯示成「尚未提供」；有步驟執行中時其他步驟的執行鈕停用；輪詢不重疊。

## 驗收
- vitest（假 gate）：SITE-FLOW `:137` 的每一條；上列 1–8 各至少一個測試；密碼不出現在任何 run output、log、回應以外的地方（斷言）。
- 突變兩次：把密碼寫進 run output、拿掉「前置步驟必須完成」→ 指名測試變紅 → 還原變綠。
- `npx tsc --noEmit`；**全套** `npx vitest run`（next-admin 的卡一律跑全套，見 COMMON-WP）。
- Playwright 既有 `tests/e2e/sites/site-flow.spec.ts` 仍過，並補一條「九步都有內容或明確的手動說明，沒有『尚未提供』」。
- SITE-FLOW 寫的「staging 子目錄站實跑」需要連主機，不在本卡；由監工在 SF-L 做。

## 邊界
不改 `aw-hosting-gate.sh` 等主機腳本（發現要改的寫進 RISKS）；不做 MainWP 與 wp-bridge 兩步（SF-I，下一張，會改同一個步驟登記表：你的登記寫法要讓它只需再加兩行）；不開 catalog 開關；不連主機；不 push。
