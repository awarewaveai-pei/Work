# 影片工具融合：Codex → Claude 接手（2026-11-18）

> 續接語：接手影片工具融合：先讀本檔，再讀同目錄 data.mjs 與計畫 §13；先審查 Codex 改動與第 5 節疑點，再接 U2.3／U11.1／U11.5。完成＝50 項全 done；每次部署仍要操作者當下同意。回報一律繁體中文。

## 1. 操作者指示與停點

- 最新指示：完成手頭工作，告一段落停止，讓已有額度的 Claude 接手；寫完整 handoff，另給操作者一份聲明。
- Codex 只完成手上 U4.6、整合及本批驗證，交接後停止；沒有開始 U11，沒有部署，沒有替操作者批准部署或真實付費驗收。
- 原接手時 32／50；本次處理 13 項，停在 **45／50**。最終計數與測試以第 9 節及 data.mjs 為準。
- done＝卡片實作及本機／整合驗證完成，**不代表本次變更已部署或正式站端到端已通過**。

## 2. 正本、位置與規則

- 整合工作樹 `D:/Worktrees/Work/u-integrate`，detached HEAD。只在此 fetch → rebase origin/main → cherry-pick → 驗證 → push HEAD:main。不在 D:/Work 整合（有別人改動），不建 branch。
- 重用工人工作樹 `D:/Worktrees/Work/eager-northcutt-4fe6a1`。U4.6 最終工人 `b72d0b0d1`，整合 `69baf3acc`；舊的未推送 `a854433e6` 已被 amend 取代，勿重複 cherry-pick。
- 狀態唯一正本：本目錄 data.mjs；改後 node build.mjs、node check.mjs，提交 data.mjs 與 supervisor.html。
- 計畫正本：`D:/Worktrees/Work/u-integrate/lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/video-unify-plan-20261116.md`。優先序 §13＞§12＞§11＞§10＞§9＞§8＞§0–7。
- 同目錄 CODEX-TAKEOVER.md §3 是 11/17 08:30 歷史，現在以本檔及 data.mjs 為準，不重接已完成列。
- NA=`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`，VW=`.../apps/video-workbench`，VS=`.../apps/video-service`。以下 repo 相對路徑以整合工作樹為根。
- 本次依原交接**沒有改共享 agency-os/WORKLOG.md／TASKS.md**，逐卡證據在本目錄；Claude 收尾時補共享紀錄，不可聲稱 Codex 已補。
- `lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD` 保留。本批同動 NA＋VW，還有 VS，不可讓 03:00 自動部署只上 NA 半套。
- hooks 曾驗到本 session PreToolUse heartbeat；verify gate 擋過時先完成真實驗證／證據，再獨立跑 verify-clear，未改 hooks、未拔正式守衛。
- 操作者現已確認 Claude 額度恢復；舊驗證檔 ORACLE_WAIVED 是當時事實，**不是 Claude review 通過**。本次停止交接，尚未重跑恢復後的 oracle；Claude 應先審 Codex 改動。

## 3. Codex 完成項目與 main 提交

| 項目 | 整合 commit | 最終行為／證據 |
|---|---|---|
| U8.3 | 1372ac8d9 | 接手工人 767ad1e5d；片頭預填、保留清空值、字數限制、圖片生成與 NT$，整合 gate 通過。狀態 bc11372e3。 |
| U4.4＋U4.5 | 0a378fc3e | 主系統生圖模型分組、每張 NT$、真實來源與計費，付費圖片下載失敗可取回；首幀影片模型按比例過濾、每秒 NT$；圖庫更新與按鈕溢出修正。狀態 8c7bff3c3。 |
| U9.1＋U9.2 | dc809bd8b | 製作聖經與 Story Bible 共用版本鏈、核准版參考圖、一致性比對、平台改寫／寫回保留角色綁定；素材 org 突變。u9-verification.md。 |
| U5.3＋U5.4 | 43ecdcaf4 | 一份 autoRun、預算、重開恢復、併發／重送去重、等真正成片／草稿完成；片頭片尾、多比例、WP 草稿。剪輯輸出副本插入片頭並平移所有軌道。u5-verification.md、u5-4-deploy-steps.md。 |
| U8.5 | a38ee5101 | 剪輯器讀同集片頭欄位，所有軌道同步平移與轉場，避免重複插入／匯出疊兩次。u8-5-verification.md。 |
| U5.5 | ec63ae734 | 成片卡／本集共用編輯、自動渲染、明確重新生成與加入影片；保留 videomain 配音主片，不重配音、新版保留舊版、字幕只位移一次，失敗重用完成票。u5-5-verification.md。 |
| U6.4 | 57daf343b＋1f66f2cf2 | 一集頁／成片卡／通知共用真實下一步；四項 QA 過才到發布，實際草稿／WP 回執判斷完成，未知不猜。狀態繁中、文字預覽堆疊隔離、去舊編號／技術字。u6-4-verification.md、u6-4-ui-verification.md。 |
| U3.6 | 4179eabf3 | ScriptForge 一鍵串 U3.5 與同一 U5 autoRun；整趟上限及比例／畫面／配音／片頭／WP 選項；原專案 brief_json 伺服器保留／實際核算／CAS、快取腳本、斷線不重扣，預算模式無 SDK 自動重試／fallback；固定 runId 原子交接、拒 full_auto。u3-6-verification.md。 |
| U6.5 | 1bf6bbb65 | 側欄自動排程讀同品牌既有話題最近 200 筆與停因，連回內容設定；排程專案接手一集、重送開同一集、不開 autoRun，後續影片保存實際場景描述。u6-5-verification.md。 |
| U4.6 | 69baf3acc | 共用 115 項＝影片 3＋藝術 103＋VW 舊 9；art-styles.js 唯一資料，tarotStyles.ts 相容匯出，video-styles.js 合併，VW capabilities 讀同檔。保留數字 p.style 給回滾，新存穩定 styleId；提示／自訂／鏡頭不掉，打包與 CI 同步。u4-6-verification.md。 |

其餘是監工資料／build 狀態提交，以 data.mjs 的逐項 commit 為準。U6.6 `688d397a5`、U3.5 `d4a254662`、U8.4 上線是接手前 Claude 完成，不冒領。

## 4. 遇過且已處理的問題

- U5 初版五項 Major：提交即標完成、建任務至存 jobId 間重送、文案費用／上限遺漏、剪輯漏片頭片尾、沿用前趟 autoEmbedded；均已修，另補實選模型報價及完成通知。見 u5-verification。
- U5.5 疊成片會重複片頭，重跑輸出會重配音：改保存真主片、版本血統及 bytes 另登記；字幕不累加，失敗重用完成票。
- U3.6 瀏覽器 spent 可重設／併發超支、回應遺失重扣、未知用量、錯誤 JSON 永久快取、快取覆寫片名、跨 run 回執、SDK 暗重試：以伺服器保留／CAS／回執／run 驗證／快取修正。
- U6.4 核准不能推論草稿完成，改讀真實結果；文字 z-index 透出任務層，用 editor-stage isolation 修正，Edge elementFromPoint 實測。
- U6.5 原排程只留旁白全文，不能還原場景：新增後續場景保存，舊無資料明示拒絕，不捏造場景。
- U4.6 直接把 p.style 改字串妨礙回滾：最終新增 styleId 並保留舊數字，新風格回滾視為自訂=8；提示完整保留，九個舊索引及鏡頭／重開已測。
- Windows 全套曾 18 案失敗，選到 system32/bash.exe；只在測試程序 PATH 前置 C:/Program Files/Git/bin，原兩支 Bash 合約 30 案及全套恢復，沒有跳測試。
- 本批最後高併發全套另有 3 案失敗（social routes、billing sidebar、ContentStudio site-wiring，兩案明示 5 秒逾時）；三檔單跑 36 案綠，再以 maxWorkers=4／minWorkers=2 跑完整套 4,785 案綠。沒有改程式／測試／逾時門檻，未把這次併發敏感現象認定為已重現的程式缺陷。
- Claude oracle 先遇既有規則格式問題，限定設定後實際回 weekly limit；設 critic 斷路、未走付費 API，採書面自審／既有只讀 critic／必要突變，不冒稱跨模型通過。
- BOM 稽核 worktree ProjectKey 會找錯 memory；改 -ProjectKey D--Work -WorkRoot D:/Work 後看到既有 27 個 memory 缺 BOM，本卡未改該批檔。
- 一次誤 cherry-pick 當前 HEAD 得空操作，已 --skip 並用確切來源 commit 整合；verify gate 擋的情況按真實驗證及獨立 verify-clear 解決。

## 5. 尚未處理／須先查證（不是已確定缺陷）

1. **手動停止的端到端語意未驗證。** VW/scripts/projects-0.js:1396–1397 的 autoRunStop 只看到本機 runPatch（定義 :912）；影片交給主系統 auto_after_render 後，停止是否還會繼續 QA／付費文案／草稿須查。沒有證明會發生、沒有修；先重現，若屬實在 U5 原卡補閉環，勿另造 runner。
2. **雙頁框片頭／run 原子性未查證。** 同檔 :1368 附近片頭與 run 分兩次寫；runtime 已拒覆蓋另一執行中 run，但第二舊頁是否能先改片頭才被拒須驗。未宣稱造成重複付費。
3. **腳本前半仍是既有頁面串流。** U5 交接後可恢復；交接前關頁，伺服器留餘額／結果，但新頁能否追回原 runId 未正式整趟驗過。不可把 U5 恢復能力套稱整條已驗。
4. **正式站／真實付費路徑未跑。** 模型金額／耗時、通知送達、子組織用量歸屬、腳本→多比例→QA→社群／WP 草稿仍待驗。原 U10.2 雖 done，其卡文也載明子組織方案歸屬待後端確認，勿略過。
5. tests/pj1-legacy-ui.cjs 接手前 main 就逾時、不在 gate；plan §10 G9／U11.1 要修好或刪除。Codex 未做這張正式驗收，未刪測試。
6. 恢復額度後 Claude review 尚未取得；先審 Codex 變更，尤其 U5 預算／去重／停止、U3.6 紀錄、U4.6 舊資料。後續 Claude 新寫部分仍須其他模型審，不得自審冒充 oracle。

## 6. 已知資料／相容限制

- U5.5 舊片已帶片頭但沒有 videomain 或原時間軸，不能精準重接；明示先從原剪輯輸出，不疊加、不猜秒數裁旁白。
- U6.4 舊草稿無 source_url，不能可靠反查影片，顯示未知不猜完成；新草稿有保存來源。
- U6.5 舊片沒場景資料不能還原，仍能查看／審片；既有 production.scenes、後續 videoScenes 可接手。接手帶描述／旁白，臨時圖片仍依舊清除。原排程不會被接手按鈕停止，畫面明示到內容設定停發布。
- 清單界限：排程最近更新 200 筆、主系統舊專案最多 100 筆，不是全歷史匯出。
- UI 金額 NT$；沒有新增下拉、hex、自訂字體或 migration，沿用 brief_json／metadata。

## 7. 測試與原始證據

- 逐卡 VW gate、NA tsc＋受影響 vitest；UI 是本機隔離站 Edge Playwright，**不是操作者登入的正式 Chrome**。
- 批 1 全套 4,758 pass／60 skipped／2 todo；批 2 全套 4,762 pass／60 skipped／2 todo；批 3 最終結果見第 9 節。
- VS 本機隔離 Linux Docker codex-video-unify-test:20261117，python -m unittest discover -s tests -p test_bookends.py -v，最終 9 案 pass／6.732 秒，真 ffmpeg 驗主片字幕從 0、帶片頭版 2500ms、轉場／舊 concat；不是正式容器測試。
- 必要突變只在記憶體：U5 素材 org、U9 參考圖 org、U6.4 成片 org、U3.6 網站／API org／預算列 org 及 until 同意白名單、U6.5 queue org；每次一守衛，指名測試紅，正式來源綠。U4.6 無適用守衛，不做無效突變。
- logs／突變 config：`C:/Users/user1115/Documents/Codex/2026-11-17/d-work-agency-os-handoffs-2026/work/`；關鍵 video-unify-batch3-full-test.log、u4-6-integration-gate.log、u3-6-mutation.config.mjs、u6-5-ownership-mutation.config.mjs。
- U4.6 已看截圖 `C:/Users/user1115/AppData/Local/Temp/vw-u46-1959e4cb-26ff-46a6-83ab-cf2f6e17619d.png`；TEMP 可能消失，可用測試的 VW_STYLE_SCREENSHOT 重產，勿當正式站畫面。

## 8. Claude 從哪裡接

1. 讀本檔／data.mjs／計畫 §13，查 git status＋fetch；先審第 5 節疑點與 Codex 變更，按必要修正、補證據，不重做 13 項。
2. 正式站驗收前提出具體部署版本／順序／rollback，取得操作者**當下**同意。本次 Codex 沒有任何部署授權。
3. VS → NA → VW，見 u5-4-deploy-steps.md；NA／VW 協調上線，既有 /root/lobster-phase1/scripts/sg-deploy.sh next-admin、video-workbench；DEPLOY_HOLD override 只限批准的部署。
4. 唯一主機 ks-aw-01＝145.239.195.47，SSH 58122；部署前重讀 AGENTS／runbook、確認沒有正在渲染，不從舊 IP 回退。VS 獨立 compose，不可硬塞 sg-deploy 或直接重啟代替程序。
5. U8.4 remotion 已由 Claude 於 11/16 上線（868c6324a 紀錄），不要因看見舊部署文件又部署；健康有問題才查。
6. 批 4 原交接指定 Claude／操作者登入瀏覽器：U2.3 真實樣式比對；U11.1 依 §8 的 20 列舊能力逐一走，含字幕與腳本送影片；U11.5 人工整趟＋一鍵到草稿＋測試站話題全自動到已排程，記點擊、NT$、耗時與上限。不得把草稿驗收當對外發布授權。
7. U11.5 過才做 U11.2 舊入口與 sf_history 來源守衛搬移、U11.3 刪舊頁／登記／文件；影片門首頁導回與刪除同批，舊歷史不刪。全 50 done 才是原目標完成。
8. 監工台 `https://claude.ai/artifact/Gq8RK8udeJR2SGvmjKpQr2`；Codex 只 build／commit supervisor.html，**未發布 artifact**，Claude 要發布同一網址。

## 9. 交接驗證紀錄

- 最後功能 commit：`69baf3acc`，基於當時 origin/main `6f0174f36` rebase 後整合；工人 `b72d0b0d1`。監工／本 handoff 另作文件提交，不用重 cherry-pick 工人 commit。
- 2026-11-18 整合版 NA `npx tsc --noEmit` exit=0。
- NA `npm test -- --maxWorkers=4 --minWorkers=2` exit=0：570 檔 pass／19 skipped；**4,785 案 pass／60 skipped／2 todo**，57.46 秒；測試程序 PATH 前置 Git Bash。
- VW `node tests/gate.cjs` exit=0，含 U4.6 舊專案／新風格／重開 Edge 實測。NA／VW 測試皆針對整合版，非只測工人樹。
- `node build.mjs`、`node check.mjs` exit=0：12 卡／50 項／**45 done**，頁面 fresh。剩餘精確為 **U2.3、U11.1、U11.2、U11.3、U11.5**。
- 原始全套高併發失敗 log 保留，成功 log 是 `work/video-unify-batch3-full-test-bounded.log`；不可只截成功片段掩蓋先前結果。
- REVIEW：本次只做文件回讀與引用核對，跨模型審查仍列第 5 節待接手；不偽稱 oracle 通過。git diff --check 通過。
- 交付前將文件／狀態提交並 push main，確認整合與重用工人樹無未提交改動；無部署、無正式站付費驗收、DEPLOY_HOLD 保留。本檔是使用者要求的停點交接，不是全專案完工聲明。

## 10. 最新續做（2026-11-18）

- 操作者重新指定 Codex 負責；Claude 額度耗盡。已授權本批部署與 Soulful 立即公開發布。§1–9 是先前交接歷史。
- OPEN3 實作在 eager-northcutt-4fe6a1，待整合至 u-integrate。NA+VW，無 migration/nginx/VS 改動；原資料不搬。
- 不變量：document org 固定；API/chunk/render/media pin；SW 每請求校對 document 與 signed identity；跨頁 shared/exclusive 作業鎖；client 忽略 staff cookie。
- 證據：本日 WORKLOG 續1；NA 4807 pass，VW gate、organization-browser、media-cache-browser 通過；ownership 記憶體突變紅→綠。
- 待做：通過部署前治理檢查→整合/push→已授權 NA/VW 部署→正式 CUA Soulful 切換、生成、QA、四社群含 YouTube 與 Kadence WordPress 公開發布。45/50 不變。
- 已實點：Soulful 四渠道存在（Bluesky/Facebook/Instagram/YouTube）；WP active Kadence；相同尺寸原生/門頁按鈕與輸入框樣式一致，未為誤報改樣式。未建立或發布測試內容。
- Claude vu-org-switch-379dad、vu-u23-u111-dfa6ae 工作樹保留不碰，避免重複版本。

- 部署更新：worker cb2241a21→整合/main 300396496；2026-11-18 台灣13:28兩容器 healthy、HTTP smoke全綠、部署後瀏覽器34 pass/24 skip。CLI等待300秒逾時但遠端同次部署正常完成，未重送。
- 正式 CUA 已按切換→Soulful Expression Art Therapy；腳本品牌 Soulful Expression。已送第一支英文腳本 A Creative Pause: Notice, Draw, Reflect，4場/0AI（UI最少4，計畫3場須結果編輯再確認）、YT Shorts/30秒、溫柔親切。尚未成片/發布。
- DEPLOY_HOLD：同批NA/VW完成後移除；未授權任何下一批部署。

- 實點進度：已生成、編輯旁白、送去影片；在專案按一鍵成片→圖庫影片、全選16:9/9:16/4:5、English女聲、標題卡片頭、直到成片、NT$10上限。三個quick-render於05:32:31/32/34 UTC建立（225d744d-aaec-4b23-a75a-e5dd1d9dd409、ff632ef0-19e6-4e9c-a422-3c8fa3e06dc8、ae77ee1e-4592-4ef5-a1e8-db2e80ee2bc6）。UI仍queued，未重送。
- 下一步：原videoTab歷史紀錄已開任務狀態overlay；等原三任務→實看影片/字幕→四QA→四社群與WP實際立即發布。source main b0721a93b、部署source300396496；HOLD已移除。

- 操作者要求先交Claude複核，已停在未部署修正：完整報告 C:/Users/user1115/Documents/Codex/2026-11-17/d-work-agency-os-handoffs-2026/outputs/SOULFUL-LIVE-REVIEW-20261118.md；同目錄 CLAUDE-REVIEW-START-20261118.md 是可直接貼的聲明。另有原始OOM/測試log、六檔pending-fixes.diff＋SHA256。
- 最終確認三比例全failed，kernel第三筆05:38:41 UTC OOM。修正版1.5GiB14pass峰值868679680；4GiB30秒3pass峰值889663488。正式仍1.5GiB，無新部署、無公開發布。
