# U3.6 驗證（2026-11-17）

根因：原本只有主題→完整腳本，以及腳本→影片的手動交接；沒有一個確認框把這兩段接到同一份 autoRun，也沒有涵蓋腳本費用的伺服器預算紀錄。

做法：手動生成模組加「一鍵到草稿」，仍呼叫 U3.5 的 manual/script、result/score；寫出腳本後仍走 shotsFromScript、spine-create、U5 的 autoRun，沒有另造影片執行器。確認框選比例、補畫面來源、配音、片頭／轉場、花費上限，以及預設不勾的網站草稿嵌入。腳本前整趟上限由既有 quick-render/quote 在伺服器計算，包含腳本／評分；腳本完成再用同端點核對實際場景的格式及價格。

腳本預算沿用 media_production_projects.brief_json，同組織、同 source_ref，updated_at compare-and-set：每次模型呼叫先保留最壞費用，完成按回報用量記帳；併發請求共用伺服器餘額，瀏覽器 spent=0 不能歸零。相同模型／提示的已完成結果可取回，回應遺失不再計費。格式錯誤可重試，先前費用仍保留；無用量回執時保留額度並停下。預算模式停用 SDK 自動重試與模型 fallback，授權及帳務綁工作台組織。原本非一鍵的腳本行為保留。

交接以 runId 固定本機 project id，對上伺服器 source_ref；片頭與 autoRun 一次寫好才開一集，重送只找回同一集。人按的一鍵只收 until=drafts，不能 full_auto。同集執行中不能覆蓋另一趟。選用的一致性檢查／自動定裝照在這個預算流程不暗中啟動，確認框有說明可稍後手動補。

驗證：
- VW `node tests/gate.cjs` 全過；`u3-one-click-runtime.cjs` Edge 實測原子交接、固定 id、重送只一集、draft-only、拒絕覆蓋執行中工作；`u5-one-click.cjs` 與價格檢查通過。
- NA `npx tsc --noEmit` 通過；projects 3、run-store 5、ScriptForge route 8、quote 4、確認框 3、真實 ScriptForge 元件 5、style-contract 7，共 35 案通過。
- 元件驗證送出前先有總價；取消沒有呼叫模型；生成後費用交給 U5；網站草稿與多比例帶過去；評分／網路失敗重試保留 run id、餘額與已完成階段；斷線可取回較低的實際費用；不暗跑另一套付費工作。
- 三個擁有權守衛分開在記憶體突變：報價網站 org（1 fail／3 pass）、腳本 API 的組織權限（1 fail／7 pass）、預算列 org（1 fail／3 pass，能讀到他人快取腳本）；每個拿掉都紅，正式來源正常全綠。
- 同意／停點守衛突變：只在記憶體移除 quick-render until 白名單，既有 one-click 的「full_auto 應拒絕」斷言變紅。原檔 one-click 正常通過。
- `git diff --check` 通過；全域對照 scriptPlan／autoBudget／SF_BUDGET／reserveScriptRun／finishScriptRun 48 行；自審已補回應退款後較低餘額恢復、無效結果不快取、快取不覆寫已生成片名、跨趟回執不寫錯預算。

ORACLE_WAIVED：Claude weekly limit quota block 仍有效，沒有付費 API 替代審查，未宣稱跨模型通過。未部署；正式登入與真實金額／耗時整趟驗收仍在 U11.5，需當下部署同意。腳本仍是既有頁面的串流流程；影片階段沿用 U5 的重開恢復機制。共享 WORKLOG／TASKS 依接手文件不改。
