# git stash inventory 2026-09-23 (read-only; nothing dropped)

Invariant: a stash is only droppable when every file it holds is byte-identical to HEAD or to a later commit. `unlanded` = files whose stash version differs from HEAD (content may have landed differently; compare before dropping).

| ref | date | name | files | unlanded vs HEAD | unlanded files (first 4) |
|---|---|---|---|---|---|
| stash@{0} | 2026-09-20 | On main: git-align-main-aoresume-feature-2026092 | 43 | 27 | .claude/commands/ao-resume.md, .claude/launch.json, CLAUDE.md, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/dashboard.html |
| stash@{1} | 2026-09-18 | On main: git-align-main-aoresume-feature-2026091 | 44 | 29 | .claude/commands/ao-resume.md, README.md, agency-os/AGENTS.md, agency-os/LAST_SYSTEM_STATUS.md |
| stash@{2} | 2026-09-18 | On main: git-align-main-aoresume-feature-2026091 | 41 | 26 | .claude/commands/ao-resume.md, README.md, agency-os/AGENTS.md, agency-os/LAST_SYSTEM_STATUS.md |
| stash@{3} | 2026-09-17 | On main: git-align-main-aoresume-feature-2026091 | 70 | 42 | .claude/commands/ao-resume.md, Projects/internal/cognitive-engineering-os/ai_lego/apps/recipe_runtime.py, Projects/internal/cognitive-engineering-os/deploy/deploy.sh, Projects/internal/cognitive-engineering-os/docs/COGNITIVE_OS_DEPLOYMENT_BLUEPRINT.md |
| stash@{4} | 2026-09-17 | On main: git-align-main-aoresume-feature-2026091 | 77 | 53 | .claude/commands/ao-resume.md, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/dispatch.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/modules/database_data/data_lineage.py |
| stash@{5} | 2026-09-17 | On main: git-align-main-aoresume-feature-2026091 | 90 | 52 | .claude/commands/ao-resume.md, Projects/internal/cognitive-engineering-os/ai_lego/apps/recipe_runtime.py, Projects/internal/cognitive-engineering-os/docs/COGNITIVE_OS_DEPLOYMENT_BLUEPRINT.md, Projects/internal/hci30/database/tests/wave1-negative-tests.sql |
| stash@{6} | 2026-09-12 | On main: git-align-main-aoresume-feature-2026091 | 24 | 7 | agency-os/memory/daily/2026-09-12.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/kb/__tests__/kb-db-keyword-sort.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/kb/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/kb/rag.ts |
| stash@{7} | 2026-09-12 | On main: git-align-main-aoresume-feature-2026091 | 30 | 12 | Projects/internal/hci30/app/public/index.html, Projects/internal/hci30/app/server.mjs, Projects/internal/hci30/database/fixtures/0001_synthetic.sql, Projects/internal/hci30/database/tests/wave1-negative-tests.sql |
| stash@{8} | 2026-09-12 | On main: concurrent-session-wip-not-mine | 1 | 1 | Projects/internal/hci30/app/public/index.html |
| stash@{9} | 2026-09-12 | On main: concurrent sessions dirty files (hci30  | 11 | 8 | Projects/internal/hci30/app/public/index.html, Projects/internal/hci30/database/tests/wave1-negative-tests.sql, Projects/internal/hci30/packages/intelligence/classify-evidence-quality.mjs, Projects/internal/hci30/scripts/dev-db-init.ps1 |
| stash@{10} | 2026-09-12 | On main: git-align-main-aoresume-feature-2026091 | 55 | 32 | .claude/commands/ao-resume.md, README.md, agency-os/AGENTS.md, agency-os/LAST_SYSTEM_STATUS.md |
| stash@{11} | 2026-09-11 | On main: git-align-main-aoresume-feature-2026091 | 17 | 4 | Projects/internal/hci30/app/public/index.html, agency-os/TASKS.md, agency-os/WORKLOG.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoStudio.tsx |
| stash@{12} | 2026-09-11 | On main: git-align-main-aoresume-feature-2026091 | 16 | 3 | agency-os/TASKS.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/registry/contract-backlog.yaml, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/registry/method-inventory.yaml |
| stash@{13} | 2026-09-11 | On main: git-align-main-aoresume-feature-2026091 | 14 | 1 | Projects/internal/hci30/app/public/index.html |
| stash@{14} | 2026-09-11 | On main: pre-pull-multisession-20260911-190457-r | 7 | 6 | Projects/internal/hci30/app/public/index.html, agency-os/TASKS.md, agency-os/WORKLOG.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/registry/contract-backlog.yaml |
| stash@{15} | 2026-09-11 | On main: pre-pull-multisession-20260911-185726 | 20 | 7 | Projects/internal/hci30/app/public/index.html, agency-os/TASKS.md, agency-os/WORKLOG.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/registry/contract-backlog.yaml |
| stash@{16} | 2026-09-11 | On main: pre-pull-stash-index-html-20260911-1853 | 1 | 1 | Projects/internal/hci30/app/public/index.html |
| stash@{17} | 2026-09-11 | On main: git-align-main-aoresume-feature-2026091 | 16 | 2 | agency-os/memory/daily/2026-09-11.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/outreach/review/ReviewClient.tsx |
| stash@{18} | 2026-09-11 | On main: git-align-main-aoresume-feature-2026091 | 33 | 9 | Projects/internal/hci30/app/public/index.html, Projects/internal/hci30/app/server.mjs, agency-os/TASKS.md, agency-os/WORKLOG.md |
| stash@{19} | 2026-09-11 | On main: git-align-main-aoresume-feature-2026091 | 19 | 4 | agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/registry/contract-backlog.yaml, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/chatwoot-client.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts |
| stash@{20} | 2026-09-11 | On main: git-align-main-aoresume-feature-2026091 | 13 | 0 |  |
| stash@{21} | 2026-09-11 | On main: git-align-main-aoresume-feature-2026091 | 21 | 7 | agency-os/docs/Customer_service/Customer_service_BUILD_PLAN.md, agency-os/docs/operations/POSTIZ_SOCIAL_PUBLISHING_PLAN.md, agency-os/memory/daily/2026-09-11.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx |
| stash@{22} | 2026-09-11 | On main: git-align-main-aoresume-feature-2026091 | 43 | 27 | .claude/commands/ao-resume.md, .claude/launch.json, README.md, agency-os/AGENTS.md |
| stash@{23} | 2026-09-10 | On main: git-align-main-aoresume-feature-2026091 | 55 | 31 | .claude/commands/ao-resume.md, .claude/launch.json, README.md, agency-os/AGENTS.md |
| stash@{24} | 2026-09-10 | On main: not-mine: concurrent hci30 session's un | 7 | 7 | Projects/internal/hci30/app/server.mjs, Projects/internal/hci30/database/fixtures/0001_synthetic.sql, Projects/internal/hci30/database/tests/wave1-negative-tests.sql, Projects/internal/hci30/scripts/dev-db-init.ps1 |
| stash@{25} | 2026-09-10 | On main: git-align-main-aoresume-feature-2026091 | 21 | 7 | .claude/launch.json, agency-os/docs/architecture/decisions/ADR_INDEX.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/FootageEditor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx |
| stash@{26} | 2026-09-10 | On main: git-align-main-aoresume-feature-2026091 | 17 | 4 | Projects/internal/hci30/app/server.mjs, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/registry/contract-backlog.yaml, agency-os/docs/architecture/decisions/ADR_INDEX.md, scripts/check-cloudflare-security.ps1 |
| stash@{27} | 2026-09-10 | On main: git-align-main-aoresume-feature-2026091 | 46 | 22 | .gitignore, WORKLOG.md, agency-os/docs/architecture/decisions/ADR_INDEX.md, agency-os/docs/video_generator/LIVE_DEPLOYMENT_BASELINE_AND_STAGING_GAP.md |
| stash@{28} | 2026-09-10 | On main: git-align-main-aoresume-feature-2026091 | 46 | 22 | .gitignore, WORKLOG.md, agency-os/docs/architecture/decisions/ADR_INDEX.md, agency-os/docs/video_generator/LIVE_DEPLOYMENT_BASELINE_AND_STAGING_GAP.md |
| stash@{29} | 2026-09-10 | On main: git-align-main-aoresume-feature-2026091 | 71 | 37 | .claude/commands/ao-resume.md, .gitignore, Projects/internal/hci30/app/public/index.html, Projects/internal/hci30/app/server.mjs |
| stash@{30} | 2026-09-10 | On main: temp-holding-pre-cognitive-os-rebase-20 | 48 | 30 | .claude/commands/ao-resume.md, Projects/internal/hci30/app/public/index.html, README.md, agency-os/AGENTS.md |
| stash@{31} | 2026-09-10 | On video-docs-20260909: git-align-main-aoresume- | 54 | 34 | .claude/commands/ao-resume.md, Projects/internal/hci30/app/public/index.html, README.md, agency-os/AGENTS.md |
| stash@{32} | 2026-09-07 | On main: git-align-main-aoresume-feature-2026090 | 54 | 38 | .claude/sessions/2026-09-03-5e7570bc-5d61-435b-a559-1bdaf326d05d.md, README.md, agency-os/AGENTS.md, agency-os/LAST_SYSTEM_STATUS.md |
| stash@{33} | 2026-09-07 | On main: git-align-main-aoresume-feature-2026090 | 65 | 42 | .claude/sessions/2026-09-03-5e7570bc-5d61-435b-a559-1bdaf326d05d.md, Projects/internal/hci30/README.md, Projects/internal/hci30/database/tests/wave1-negative-tests.sql, Projects/internal/hci30/scripts/mutation-check-wave1.ps1 |
| stash@{34} | 2026-08-29 | On main: git-align-main-aoresume-feature-2026082 | 22 | 9 | .claude/sessions/2026-08-27-2869d6c5-85ad-48e8-9428-8e6b0e57cfe7.md, .claude/sessions/2026-08-27-30cda7b9-1950-472c-9c04-d149366bab90.md, README.md, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/.ai/research/phase-0/open-questions.yaml |
| stash@{35} | 2026-08-27 | On main: git-align-main-aoresume-feature-2026082 | 25 | 11 | .claude/sessions/2026-08-26-3073cb1d-5bda-42bd-8085-ba9eb9e2eef4.md, agency-os/LAST_SYSTEM_STATUS.md, agency-os/TASKS.md, agency-os/WORKLOG.md |
| stash@{36} | 2026-06-25 | On main: main-dirty-evoplan | 7 | 1 | agency-os/WORKLOG.md |
| stash@{37} | 2026-06-25 | On main: main-dirty-ui3 | 1 | 1 | agency-os/memory/daily/2026-06-25.md |
| stash@{38} | 2026-06-25 | On main: main-dirty-ui2 | 16 | 5 | agency-os/memory/daily/2026-06-25.md, lobster-factory/infra/hetzner-phase1-core/apps/remotion-service/Dockerfile, lobster-factory/infra/hetzner-phase1-core/apps/remotion-service/package.json, lobster-factory/infra/hetzner-phase1-core/apps/remotion-service/src/Root.tsx |
| stash@{39} | 2026-06-25 | On main: all-dirty-before-ui | 1 | 1 | agency-os/memory/daily/2026-06-25.md |
| stash@{40} | 2026-06-25 | On main: status-ui | 5 | 0 |  |
| stash@{41} | 2026-06-25 | On main: status-3 | 6 | 0 |  |
| stash@{42} | 2026-06-25 | On main: status-reports-2 | 6 | 0 |  |
| stash@{43} | 2026-06-25 | On main: status reports before branch switch | 7 | 0 |  |
| stash@{44} | 2026-04-25 | On main: git-align-main-aoresume-feature-2026042 | 0 | 0 |  |
| stash@{45} | 2026-04-23 | On main: crlf-before-pull- | 0 | 0 |  |
| stash@{46} | 2026-04-22 | On main: pre-align-2026-04-22-1730 | 0 | 0 |  |
| stash@{47} | 2026-04-21 | On main: ao-resume-before-pull-20260421-183952 | 2 | 1 | agency-os/WORKLOG.md |
| stash@{48} | 2026-04-16 | On main: ao-resume-before-pull-20260416-194248 | 2 | 1 | agency-os/WORKLOG.md |
| stash@{49} | 2026-04-10 | On main: WIP: cursor rules sync + scripts before | 0 | 0 |  |
| stash@{50} | 2026-04-09 | On main: auto-sync-unexpected-dirty-20260409-205 | 0 | 0 |  |
| stash@{51} | 2026-04-06 | On main: auto-sync-unexpected-dirty-20260406-171 | 20 | 19 | README.md, agency-os/AGENTS.md, agency-os/LAST_SYSTEM_STATUS.md, agency-os/README.md |
| stash@{52} | 2026-04-06 | On main: auto-sync-unexpected-dirty-20260406-170 | 2 | 2 | agency-os/AGENTS.md, agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md |
| stash@{53} | 2026-04-06 | On main: auto-sync-unexpected-dirty-20260406-170 | 2 | 2 | agency-os/AGENTS.md, agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md |
| stash@{54} | 2026-03-29 | On main: auto-sync-before-pull-20260329-233201 | 18 | 17 | agency-os/AGENTS.md, agency-os/LAST_SYSTEM_STATUS.md, agency-os/README.md, agency-os/TASKS.md |
| stash@{55} | 2026-03-26 | On main: auto-sync-unexpected-dirty-20260326-234 | 3 | 3 | .cursor/rules/30-resume-keyword.mdc, agency-os/.cursor/rules/00-session-bootstrap.mdc, scripts/generate-integrated-status-report.ps1 |
| stash@{56} | 2026-03-26 | On main: auto-sync-unexpected-dirty-20260326-233 | 6 | 6 | .cursor/rules/30-resume-keyword.mdc, agency-os/.cursor/rules/00-session-bootstrap.mdc, agency-os/TASKS.md, agency-os/WORKLOG.md |
| stash@{57} | 2026-03-26 | On main: auto-sync-unexpected-dirty-20260326-225 | 5 | 5 | .cursor/rules/30-resume-keyword.mdc, agency-os/.cursor/rules/00-session-bootstrap.mdc, agency-os/AGENTS.md, agency-os/README.md |
| stash@{58} | 2026-03-26 | On main: auto-sync-unexpected-dirty-20260326-223 | 3 | 3 | .cursor/rules/30-resume-keyword.mdc, agency-os/.cursor/rules/00-session-bootstrap.mdc, scripts/generate-integrated-status-report.ps1 |
| stash@{59} | 2026-03-26 | On main: auto-sync-unexpected-dirty-20260326-223 | 18 | 17 | .cursor/rules/30-resume-keyword.mdc, .cursor/rules/40-shutdown-closeout.mdc, agency-os/.cursor/rules/00-session-bootstrap.mdc, agency-os/.cursor/rules/40-shutdown-closeout.mdc |
| stash@{60} | 2026-03-26 | On main: auto-sync-unexpected-dirty-20260326-223 | 18 | 17 | .cursor/rules/00-session-bootstrap.mdc, .cursor/rules/40-shutdown-closeout.mdc, agency-os/.cursor/rules/30-resume-keyword.mdc, agency-os/.cursor/rules/40-shutdown-closeout.mdc |
| stash@{61} | 2026-03-26 | On main: sync-safety-before-hard-reset-20260326 | 3 | 3 | .cursor/rules/00-session-bootstrap.mdc, .cursor/rules/30-resume-keyword.mdc, agency-os/scripts/generate-integrated-status-report.ps1 |
| stash@{62} | 2026-03-26 | On main: temp-post-pull-reapplied-20260326 | 3 | 3 | agency-os/.cursor/rules/00-session-bootstrap.mdc, agency-os/.cursor/rules/30-resume-keyword.mdc, scripts/generate-integrated-status-report.ps1 |
| stash@{63} | 2026-03-26 | On main: temp-before-pull-20260326 | 1 | 0 |  |
