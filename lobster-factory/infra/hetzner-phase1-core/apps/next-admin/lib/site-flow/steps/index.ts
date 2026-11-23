// The step registry (SITE-FLOW-COMPLETION-PLAN.md §3: SF-H host steps, SF-I mainwp and bridge) and the two page panels that are observations, not steps: 第 4 步 每日備份, 第 8 步 手動項目.

import type { ReadContext, SiteStepRegistry } from "../types";
import { bridgeStep } from "./bridge";
import { containerStep } from "./container";
import { mainwpStep } from "./mainwp";
import { manualPanel } from "./manual-checks";
import { openStep } from "./open";
import { preflightStep } from "./preflight";
import { readPreflight } from "./shared";
import { vhostStep } from "./vhost";
import { wpInstallStep } from "./wp-install";

export const HOST_STEPS: SiteStepRegistry = {
  preflight: preflightStep,
  create: containerStep,
  wp_install: wpInstallStep,
  vhost: vhostStep,
  mainwp: mainwpStep,
  bridge: bridgeStep,
  open: openStep,
};

type Json = Record<string, unknown>;

/**
 * 第 4 步: the host registry file is what backup-ks-aw-01.sh reads (SF-F), so "registered" = "in tonight's backup".
 * The gate reports no backup time yet: lastBackupAt stays null and the page says so.
 */
export async function backupPanel(ctx: ReadContext): Promise<Json> {
  const r = await readPreflight(ctx);
  if ("detail" in r) return { state: "unknown", detail: `無法確認：${r.detail}`, lastBackupAt: null };
  if (!r.pf.registry) return { state: "absent", detail: "還沒列入：第 2 步完成後自動列入當晚備份", lastBackupAt: null };
  return { state: "listed", detail: "已列入每日備份（主機登記檔在）", lastBackupAt: null };
}

/** Everything GET /api/ops/site-flow/[siteId] shows besides the steps. */
export async function sitePanels(ctx: ReadContext): Promise<Json> {
  return { backup: await backupPanel(ctx), manual_checks: manualPanel(ctx.site.metadata) };
}
