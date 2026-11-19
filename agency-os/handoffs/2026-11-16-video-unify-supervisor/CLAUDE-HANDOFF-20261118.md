# Video unify supervisor — Claude handoff (updated 2026-11-19 00:30)

續接語：續做 影片工具融合監工：讀 agency-os/handoffs/2026-11-16-video-unify-supervisor/CLAUDE-HANDOFF-20261118.md，從「下一步 1」開始；完成＝data.mjs 50 項全 done（現 47/50，剩 U11.2、U11.3、U11.5）。操作者 2026-11-18 已全部核准部署與發布（「我全部同意核准，需要決定的事都你決定」）。回報一律繁中。建議模型：Opus 5.5。

## State (facts, verified)
- Integrate only in `D:/Worktrees/Work/u-integrate` (detached): fetch → rebase origin/main → change or cherry-pick → verify → `git push origin HEAD:main`. Never in D:\Work.
- Supervisor: edit `data.mjs` here → `node build.mjs && node check.mjs` → commit with pathspec → Artifact publish `supervisor.html` to https://claude.ai/artifact/Gq8RK8udeJR2SGvmjKpQr2 (republish same URL).
- Live versions: next-admin `a67e9bfcb`, video-workbench `754efe007` (code = a67e9bfcb), video-service `0ad5d240b`, wp-bridge 0.22.0 on aware-wave.com + Soulful.
- Deploy: `ssh -p 58122 ubuntu@145.239.195.47 "sudo /root/lobster-phase1/scripts/sg-deploy.sh <next-admin|video-workbench>"`, first line `# CONFIRMED-HIGH-RISK: …`. video-service: git archive → docker build → unittest → safe-infra-patch compose (recipe in WORKLOG 2026-11-18).
- Worktree removal: `cmd /c rmdir <app>\node_modules` (junctions into D:\Work) BEFORE `git worktree remove`, else D:\Work node_modules gets emptied.
- Browser: the app's built-in browser (signed in to video.aware-wave.com and app.aware-wave.com). Claude in Chrome does not connect. Workbench pages are iframes: click by coordinates; read via javascript_tool on `iframe.contentDocument`.

## Soulful run (org 2bf60452-3d4d-47c2-9970-b9046ed1a35a) — full SOP + 29 issues
`SOULFUL-LIVE-RUN-SOP-20261118.md` in this folder: §1 SOP, §2 A fixed (11), §2 B open (18), §2 C covers/Remotion, §2 D recommendations in order.
- Final renders (workbench asset ids): 16:9 `55f52cba-3019-4aa9-8aac-d068b88586a7` (job d9dc4ba2…), 9:16 `3a95c067-8fd6-4cc6-bea2-9802039ea395`, 4:5 `41b1ee7e-9a4a-47a4-a8e6-20f885db2481` (job 6a87d269…). 16:9 and 4:5 approved.
- WordPress post #7753 (soulfulexpression.org, Kadence): 16:9 video embedded, body + disclaimer + 1925/1995, author 3, status future 2026-11-19 04:00 UTC = 12:00 Taipei. No poster (no cover then).
- Social drafts (app social tool, brand Soulful, view 貼文清單): YouTube←16:9 `7371fd94…`; Facebook `10983378…`, Instagram `a9cd8360…`, Bluesky `938162eb…` ←4:5. All draft, no cover, NOT scheduled.

## 下一步
1. Wait for operator on 待決 5 (supervisor): Remotion cover template now, or schedule with current covers. Default if no answer before 10:00 Taipei 11/19: current covers.
2. Covers for the two approved videos: they were rendered before c02b5fd07, so no candidates. Generate with the workbench's own code (`backend/cover.cjs autoCovers`, frames from the clean copy `media_assets.metadata.cleanUrl`), then set them through the release panel's cover upload (POST multipart `/api/video/cover?organizationId=…`, fields assetId, rightsConfirmed=true, file). Check the image has no caption line.
3. Delete the 4 social drafts in the social tool, re-save from the 16:9 panel (YouTube only) and the 4:5 panel (Facebook, Instagram, Bluesky) so they carry the cover; reuse the copy above (no therapy claims).
4. Schedule all 4 at 2026-11-19 12:00 Taipei. The social tool shows 組織時區（UTC）: enter 04:00 UTC or switch the view to 台灣. Confirm YouTube has the 16:9 file.
5. Post #7753 poster: post is `future`, so the bridge refuses edits; set the poster via wp-cli on host (`docker exec soulful-wp wp --allow-root …`) or move to draft, re-embed, re-schedule.
6. Mark U11.5 done in data.mjs once the posts are scheduled; republish supervisor.
7. Then U11.2 (old entry → 開啟影音工作台, script history move) and U11.3 (delete retired pages; video door home → workbench) per plan §13; deploy.
8. WORKLOG entry for 2026-11-18/19 not written yet (use `scripts/git-partial-worktree-commit.py stage`).
