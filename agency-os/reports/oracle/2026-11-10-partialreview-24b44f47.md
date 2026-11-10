# codex-oracle review -- 2026-11-10 12:23:07 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/sf3d-local.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/s4b-sf3d-local.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/s4b2-evidence/run-local.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/s4b2-evidence/analyze.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/sf3d/install.cmd, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/sf3d/texture-baker-cpu.patch  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card S4b.2 local SF3D: install script for Stable Fast 3D on Windows (VS Build Tools, torch cu128, gpytoolbox 0.3.8, CPU-only texture_baker + patch routing CUDA tensors via CPU), sf3d-local HF_HOME default <dir>/.hf, local-sf3d facing 180, real start/409/cancel/kill/rerun test, evidence run script. Known open: rerunning install.cmd rebuilt uv_unwrapper and its _C now fails to load (procedure not found) -- say what you think causes it.
- exit: 0 | elapsed: 149992ms | answer: 1742B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/sf3d-local.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/s4b2-evidence/analyze.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/s4b2-evidence/run-local.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/s4b-sf3d-local.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 重跑安裝會重編原本可用的 `uv_unwrapper`，且未鎖定其依賴的 torch 版本
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/sf3d/install.cmd:28
  confidence  -> PLAUSIBLE
  scenario    -> 已可用的安裝重跑腳本後，`_C` 載入時出現「specified procedure could not be found」，本機生成隨即失敗。最可能是重編出的擴充模組與載入時的 PyTorch 原生 DLL 不相容；目前證據不足以確認是哪個符號或哪一步造成不相容。
  why missed  -> 首次安裝和重跑安裝走同一條建置路徑；首次成功不能驗證重跑安全。

FINDING 2: 證據腳本重跑會在素材庫重複加入模型
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/s4b2-evidence/run-local.cjs:30
  confidence  -> CONFIRMED
  scenario    -> 十張圖已有成功紀錄時，為驗證修復而重跑腳本；它重新生成十個任務，再把十筆資產直接接到現有 `state.assets`，素材庫出現重複項。
  why missed  -> 腳本保存了每張圖的最新結果，但新增素材庫項目時沒有檢查已有紀錄。

FINDING 3: 分析腳本遇到方式表以外的成功紀錄會中止
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/s4b2-evidence/analyze.cjs:52
  confidence  -> CONFIRMED
  scenario    -> `results.json` 加入一次成功的 `stability-sf3d` 或 `meshy` 紀錄後執行分析；該方式在第 9 行沒有角度值，傳給 `thumbs.py` 的 yaw 是 `undefined`，`float(yaw)` 失敗，整張對照圖無法產出。
  why missed  -> 對照圖欄位只列三種方式，但 GLB 處理迴圈讀取所有成功紀錄。

TOTAL: 3 findings
