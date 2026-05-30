# Client Onboarding Portal — raw fallback 副本（2026-05-30 snapshot）

> **用途**：跨機 fallback。萬一 AO-RESUME / handoff 自動 surfacing 失靈，這裡有一份簡單好找的離線副本。
> **這些是副本（snapshot），不是 SSOT**。正本在 `agency-os/`，會持續更新；本資料夾是 2026-05-30 當下的快照。

## 開工先讀（順序）

1. **`client-onboarding-portal-CODEBASE-MAP.md`** ← 先讀這個。§0 是 reading list，§1/§2 是 build 側 + ops 側全部 file:line + 精確 schema（研究已完成，不必重跑 Explore agent）。
2. `handoff-1641-wp-bridge-gap-analysis.md` — 平台 ~80% 已存在的 gap 分析 + net-new 5 支柱 + reuse 路徑。
3. `handoff-1644-14-section-spec-task.md` — 14 段規格的任務契約 + 限制條件。
4. `design-plan-L1-L4-control-plane.md` — 四層控制平面 L1-L4 全文設計 / 威脅模型 / 商業定位（24KB）。

## 正本位置（這些會更新，副本不會）

| 副本（本資料夾） | 正本（SSOT，git 持續更新） |
|---|---|
| `client-onboarding-portal-CODEBASE-MAP.md` | `agency-os/docs/specs/client-onboarding-portal-CODEBASE-MAP.md` |
| `handoff-1641-*.md` | `agency-os/handoffs/2026-05-30-1641-tomo-164100.md` |
| `handoff-1644-*.md` | `agency-os/handoffs/2026-05-30-1644-onboarding-portal-spec.md` |
| `design-plan-L1-L4-*.md` | `.claude/plans/https-github-com-jonjonesai-claude-wp-sequential-clock.md` |

## 任務狀態

研究**已完成**（2026-05-30）。剩下：**寫 14 段完整規格** → `agency-os/docs/specs/client-onboarding-portal-spec.md`（尚未開始）。
TASKS.md 對應行：`### 未完成` → `#### 待釐清 / 明日提醒`。
