# Banner pro-design — dispatch state (supervisor = main session)

Operator 2026-11-26 01:23: 「1-5都做；一次做完全部尺寸要可以挑尺寸；明天起床時要看到你做完全部+部署」 → deploy authorized (one sg-deploy of next-admin at batch end, then /playwright smoke).

Target: `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/`

| Card | What | Worker | State |
|---|---|---|---|
| C1 | layers → PSD/SVG editable text; JPG/WebP target KB; 修圖/向量（專業版）buttons; 片頭 buttons fill sample text | banner-layers (local_add41231) | committed e2f3b43d3 (branch claude/modest-ellis-5bccc9) |

Note 2026-11-26: both workers hit the 5-hour limit ~02:xx (reset 04:10); resumed 06:44 on operator's 「請再試一次」.
| C2 | bg upload drag/zoom; shadow settings text/CTA/badge (+PSD/SVG) | banner-layers | committed eeb795200 |
| C3 | CJK typography: weights, line height, tracking, 避頭尾, 中英間距, more fonts | banner-layers | in progress (uncommitted 08:11; worker stalled 07:02 waiting on a background critic, nudged) |
| C4 | free placement of each element (drag), grid + thirds guides | banner-layers | queued |
| C5 | multi-size: pick sizes (checkboxes) → variants keep subject, per-size tweak, download all / save all | banner-layers | queued |
| C6 | brand kit module (logo, colours, fonts; no migration) | banner-modules | done 13a718295 (branch claude/busy-nash-b53413); kit in client_config.bannerKit |
| C7 | product grounding module (contact shadow, reflection, colour match) | banner-modules | done 13a718295 |
| C8 | wire C6+C7 into BannerStudio | banner-layers (after C5) | queued |

Rules: banner-layers owns BannerStudio.tsx/banner-layers.ts; banner-modules only new files under `banner/kit/` and `banner/product-grounding.ts` (+ tests). Supervisor: review diff, Codex review, merge to main (merge-tree recipe, shared worktree dirty), one deploy, smoke, look at the live page, report in 繁中.

## Closed 2026-11-26 09:00
All C1-C8 merged f287df2c5 (+ Codex fixes ebe1fa65b, CI fix 6b9032f09) and deployed 6b9032f09 (healthy, HTTP smoke 5/5, playwright smoke 30/0/22). Live checks + open items: WORKLOG 2026-11-26 banner deploy entry.
