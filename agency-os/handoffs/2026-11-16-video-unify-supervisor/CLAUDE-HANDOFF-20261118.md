# Video unify supervisor — Claude handoff 2026-11-18 23:10

續接語：續做 影片工具融合監工：讀本檔，從「下一步 1」開始；完成＝data.mjs 50 項全 done、每次部署經操作者同意（操作者 2026-11-18：「我全部同意核准，需要決定的事都你決定」）。回報一律繁中。建議模型：Opus 5.5。

## State (facts, verified)
- Integrate only in `D:/Worktrees/Work/u-integrate` (detached): fetch → rebase origin/main → cherry-pick → verify → `git push origin HEAD:main`. Supervisor: `data.mjs` here → `node build.mjs && node check.mjs` → commit → Artifact publish `supervisor.html` (URL Gq8RK8udeJR2SGvmjKpQr2). 46/50 done.
- Live: video-service `0ad5d240b` (cpuset 30,31 + 3 GiB; bookend join bt709 + length check; text fit; QA still-windows), workbench `740618510` (5xx retry), next-admin `1fe9adedd`. DEPLOY_HOLD absent.
- Deploy recipes: VS = scratchpad `deploy-vs2.sh` pattern (git archive → docker build → unittest → safe-infra-patch compose → health bookends); VW/NA = `sudo /root/lobster-phase1/scripts/sg-deploy.sh <app>` over `ssh -p 58122 ubuntu@145.239.195.47`. First line `# CONFIRMED-HIGH-RISK: …`.
- Browser: Claude in Chrome does not connect after reboot; use the app's built-in browser (signed in, client switch = Soulful). Workbench pages are iframes: find() can't see inside; click by coordinates; read via javascript_tool on iframe.contentDocument.

## U11.5 Soulful live run (org 2bf60452-3d4d-47c2-9970-b9046ed1a35a)
- Project "A 30-Second Creative Pause: Notice, Draw, Reflect". Final renders (22:3x-22:41): workbench cards v10=16:9, v11=9:16, v12=4:5; all 29.67 s, text inside frame, 4 QA passed.
- Approved for release: 16:9 and 4:5. Social drafts saved (copy edited: no therapy claims / no invented newsletter): YouTube←16:9; Facebook, Instagram, Bluesky←4:5. NOT yet scheduled.
- WordPress: draft #7753 created on soulfulexpression.org (Kadence) but video NOT embedded: REST credential "Admin" in wp_sites does not authenticate (`/wp-json/wp/v2/users/me` → rest_not_logged_in); create went via wp-bridge. Background subagent fixing "one channel per site" in worktree `D:/Worktrees/Work/vu-wp-embed` (NA node_modules is a JUNCTION: `cmd /c rmdir` it before removing the worktree).

## 下一步
1. Collect the vu-wp-embed result (commit in that worktree); review; integrate; deploy NA (+ wp-bridge release if it added an endpoint — follow `scripts/release-wp-bridge.sh`); then embed the 16:9 video into draft #7753 and publish the post in WP admin (theme Kadence; set the publish time = social time).
2. Schedule the 4 social drafts in the main system 社群工具 (Soulful) for a time ≥ now+1h; record time; confirm YouTube gets 16:9.
3. Record U11.5 numbers (clicks not counted; cost: script ≈NT$1.8 est., renders NT$0, AI copy 2×≈NT$0.1) and close U11.5 in data.mjs only after posts are live/scheduled. U11.1 → done (all 20 §8 rows walked live 2026-11-18).
4. Then U11.2 (old entry → 開啟影音工作台, script history move) and U11.3 (delete retired pages; video door home → workbench) per plan §13; deploy with go.
5. Open gaps to log/fix (supervisor 待決 4 has the rest): (a) multi-ratio one-click yields one release panel per ratio — no cross-ratio per-platform pick; (b) v10 card showed 「主系統狀態暫時讀不到」 once; (c) release panel waits ~30 s on `/api/video/assets?includeWorkbench=1`; (d) one-click dialog forgets 全選 (resets to 9:16).
6. WORKLOG entry for 2026-11-18 not written yet (do via `scripts/git-partial-worktree-commit.py stage`).
