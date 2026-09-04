# RUNNABLE_DEMOS — 操作者自己能跑的東西（進度唯一看得見的面）

> 2026-09-04 起，`AGENTS.md` DoD 的「Product work」列要求每個產品類任務登記一條**操作者能自己執行的指令 + 它的輸出**；AO-RESUME §1 每次列最新一列。gate 表格全 CLOSED、ADR 全 ACCEPTED 都不算「有東西成形」，只有這張表上的列才算。**最新的一列放最上面。** 一列一個 demo；同一個 demo 有新版本就加新列，不改舊列。

| 日期 | 系統 | 指令（從 `D:\Work` 執行） | 你會看到什麼 | 誠實範圍 |
|---|---|---|---|---|
| 2026-09-04 | Cognitive Engineering OS — 切片第一次真的呼叫模型（本機 Ollama `gemma3:4b`，資料不出機器） | `cd Projects\internal\cognitive-engineering-os && python -m ai_lego.apps.cli.run_research_slice --coding local-llm --runtime-dir %TEMP%\ai-lego-llm-run` | `PASS … 28/28 steps, all gates PASS`，`adapters` 顯示 `coding_mode: local-llm, open_coding_model: gemma3:4b`；到 `%TEMP%\ai-lego-llm-run\modules\research\open_coding_model_response.json` 看模型真的回了什麼（label＋逐字 evidence_span＋被拒收的項目）；`results\slice_result.json` 的 `coder_1.code_set` 兩個 `AI_SUGGESTED` code 帶 `suggestion_source`（模型、prompt 版本、trace id、token 數） | 只有 coder-1 的兩個待審 code 是真模型產生；逐字稿仍是合成、coder 2／分類／主題仍是 fixture；第一次跑約 2 分鐘（模型載入 GPU），之後每次約 10 秒；Ollama 沒開會直接 `UNAVAILABLE`（exit 2），不會偷偷退回 fixture |
| 2026-09-04 | Cognitive Engineering OS — Phase 5 Research Mode 切片 | `powershell -ExecutionPolicy Bypass -File Projects\internal\cognitive-engineering-os\scripts\test-phase5-local.ps1` | 131 tests OK、`PHASE5 LOCAL RUNNER: PASS (fixture AND offline-STT both exercised, zero skips)`、CLI smoke `PASS … 28/28 steps, all gates PASS`，Kappa 0.75 | 本機合成資料；語音辨識是真的（faster-whisper），coding 建議／第二位 coder／主題是合成 fixture；無 UI、無真 LLM、無部署 |
| 2026-09-04 | 同上，單獨跑一次切片並看輸出目錄 | `cd Projects\internal\cognitive-engineering-os && python -m ai_lego.apps.cli.run_research_slice --transcription fixture --runtime-dir %TEMP%\ai-lego-demo` | `PASS: synthetic Phase 5 Research Mode slice completed`，然後到 `%TEMP%\ai-lego-demo` 看 `artifacts/research_memo.md`、`platform/execution/manifest.json`、`data/events/ledger.jsonl` | 同上；`--transcription offline-stt` 會用真 Windows 語音 + 離線 whisper，慢約 25 秒 |

## Related Documents (Auto-Synced)
- `../.claude/commands/ao-resume.md`
- `AGENTS.md`

_Last synced: 2026-09-04 02:19:06 UTC_

