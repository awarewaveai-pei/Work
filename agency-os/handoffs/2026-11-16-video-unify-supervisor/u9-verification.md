# U9 驗收證據（2026-11-17）

- 根因：製作聖經與 Story Bible 無共用版本鏈；平台改寫及寫回鏡頭未完整保留角色綁定。
- 接管修正：`scripts/projects-bible.js` 一致性比對原取專案可變的參考圖，現從最新核准版匯入定裝照後按角色 key 配對；不修改專案參考圖。`tests/u9-bible.cjs` 已重現紅燈後修正轉綠。
- 實測：工作台 `node tests/gate.cjs` 全過；next-admin `npx --no-install tsc --noEmit` 通過；五檔受影響 Vitest 共 21 個測試通過；registry-code 14 個測試通過。
- REALTEST_EVIDENCE: tool=Bash | cmd=node tests/u9-bible.cjs | exit=0 | ms=209
- 擁有權守衛突變：以 Vite 記憶體轉換移除 storage 路由的組織條件（不改來源檔），`storage/route.test.ts` 由 2 過變成 1 過／1 失敗，實際回傳外組織素材；正常設定重跑 2 過。
- REVIEW_DONE: critic=Deep | verdict=warn | findings=0c/1m/0n
- ORACLE_WAIVED: Claude CLI 首次因既有權限規則格式錯誤失敗；限定 project/local 設定後確認每週額度耗盡，已記錄 critic 斷路器。採書面對抗自審＋上述擁有權突變；未冒稱跨模型審查通過。
- BUGHUNT_DONE: scope=agency-os,scripts,lobster-factory | grep=storyBibleSeries|story-bible-production|storageBases|keepCharacterIds|visualConsistencyUsd | hits=51
- 自審：版本映射保留 continuity／episode／provenance／rightsNote 與專案未知欄位；素材查詢同時限制 organization_id 與 is_current；無新發布入口；既有專案與版本不刪。共享 WORKLOG 依 CODEX-TAKEOVER.md §2 留給 Claude 收尾。
- 部署：兩邊改動須沿用整合工作樹的 DEPLOY_HOLD；取得操作者當下同意後才部署。正式站實點與監工台發布尚待後續驗收。
- 文件檢查：跨機 BOM 稽核發現 27 份既有 memory 缺 BOM，未修改該批無關記憶檔；本次新增 repo 文件不需 BOM。
