# codex-oracle review -- 2026-11-12 21:13:23 +08:00

- mode: `review`
- scope: whole repo
- target: `44a5d0381`
- context: Card S4b local Stable Fast 3D moved into WSL (Windows Smart App Control blocks rebuilt unsigned .pyd, kept on): backend/sf3d-local.cjs starts wsl.exe -d <distro> -- bash scripts/sf3d/run-wsl.sh <image> <out>, one wslPath(); the entry setsids and writes pgid, cancel/timeout kill the Linux group then wsl.exe; scripts/sf3d/install-wsl.sh is re-runnable: builds releases/<stamp>, must import + make one GLB before an atomic symlink swap, failure deletes the new release and keeps current (tested: git clone failure and pip failure after venv creation both kept current), keeps previous release. Check: cancel kills everything, a failed install never breaks current, no token written, one job at a time.
- exit: 0 | elapsed: 164272ms | answer: 1653B
- files-reviewed: agency-os/WORKLOG.md, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/sf3d-local.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/s4-image-to-3d-providers-20261103.md, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/s4b2-evidence/run-local.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/sf3d/install-wsl.sh, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/sf3d/install.cmd, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/sf3d/run-wsl.sh, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/s4b-image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/s4b-sf3d-local.cjs
- deletions-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/sf3d/install.cmd@07c9850c4

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 同一秒重跑 `--force` 會刪掉正在使用的版本
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/sf3d/install-wsl.sh:23
  confidence  -> CONFIRMED
  scenario    -> 安裝剛完成，同一秒再次執行 `--force`；新 `STAGE` 與 `current` 指向同一路徑，`git clone` 因目錄已存在而失敗，失敗清理在第 25 行刪掉該路徑，`current` 隨即變成斷裂連結。
  why missed  -> 已記錄的重跑測試間隔數分鐘，沒有覆蓋時間戳重複。

FINDING 2: 設定了 WSL 發行版卻未安裝模型時，介面仍宣稱本機方式可用
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/sf3d-local.cjs:20
  confidence  -> CONFIRMED
  scenario    -> `VW_SF3D_WSL=Ubuntu`、`wsl.exe` 存在，但 `current` 尚未建立或已斷裂；`installed()` 仍回傳可用，能力清單會把免費本機方式列為可用並優先預選，使用者送出後任務才失敗。
  why missed  -> 實跑時已有完整安裝；可用性檢查只驗設定值與 Windows 執行檔。

FINDING 3: 真實測試在非 Ubuntu 的有效設定下會跳過並回報成功
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/s4b-sf3d-local.cjs:12
  confidence  -> CONFIRMED
  scenario    -> `VW_SF3D_WSL` 指向已安裝的另一個發行版，Ubuntu 未安裝；測試固定檢查 Ubuntu，第 13–15 行輸出 `SKIP` 並以退出碼 0 結束，取消與 GLB 流程完全沒有受測。
  why missed  -> 開發機與測試都使用 Ubuntu，未拿設定的發行版名稱作為測試輸入。

TOTAL: 3 findings
