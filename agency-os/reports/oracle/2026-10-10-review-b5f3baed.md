# codex-oracle review -- 2026-10-10 12:54:36 +08:00

- mode: `review`
- scope: whole repo
- target: `working tree (staged + unstaged + untracked)`
- context: Second pass. Earlier pass (NO FINDINGS) covered: OPEN_BLOCKS = BLOCKS, BUILD_STEP/OPEN_STEP = 4, main-menu items, phone bar scroll, two guard tests. NEW since then: TEACH/FACILITATE/COLLAB have no /projects/[id]/<path> page (their pages are /me/teach, /lead, /groups), so lib/blocks.ts gains Block.home + blockHref(), used at every block link (BlockShell slots, next button, route card; IntakePage first block); test_every_open_block_has_its_page honours home; stale tests that hard-coded step-1 'open: False' updated; two closed-block guard tests now patch block_hooks.assembler.OPEN_BLOCKS to keep exercising the guard. Review the new part: any remaining link that builds /projects/{id}/{path} for those three, a patch that does not reach the guard it claims to exercise, privacy/consent/ownership guards that relied on a block being closed. Only run tests a finding names.
- exit: 0 | elapsed: 239963ms | answer: 11B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/core/domain/kinds/assembler.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/design-system.css, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/AppNav.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/Projects.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/BlockShell.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/IntakePage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/blocks.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/catalog.test.ts, Projects/internal/cognitive-engineering-os/docs/mockups/design-system.css, Projects/internal/cognitive-engineering-os/docs/mockups/home-mock.html, Projects/internal/cognitive-engineering-os/docs/mockups/iceberg-lesson-mock.html, Projects/internal/cognitive-engineering-os/docs/mockups/iceberg-result-mock.html, Projects/internal/cognitive-engineering-os/docs/mockups/workflow-lesson-mock.html, Projects/internal/cognitive-engineering-os/docs/mockups/workflow-result-mock.html, Projects/internal/cognitive-engineering-os/tests/unit/test_block_decide.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_foundation.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_learn.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_map.py, Projects/internal/cognitive-engineering-os/tests/unit/test_integrity.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
