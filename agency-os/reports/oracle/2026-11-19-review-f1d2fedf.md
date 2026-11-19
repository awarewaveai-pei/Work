# codex-oracle review -- 2026-11-19 13:41:46 +08:00

- mode: `review`
- scope: whole repo
- target: `working tree (staged + unstaged + untracked)`
- context: N1: topic-queue video passes workbench four-check QA + Release before embed/social attach (lib/content/topics/video-release.ts reuses project-advance-deps rows/qaProblems/release; reviewProblems extracted from project-advance.ts without behaviour change); embed carries releaseId; old embedded topics untouched
- exit: 0 | elapsed: 124729ms | answer: 690B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/make-video.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/video-release.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/project-advance.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/topic-project.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 既有社群媒體會讓影片略過審片與 Release，仍進入發布流程  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/make.ts:280  
  confidence  -> CONFIRMED  
  scenario    -> `social + video` 題目沒有文章；影片完成前，有人已在社群草稿加入媒體。`post.media.length` 使程式走第 285 行，未呼叫 `released()`，但題目仍進入 `reviewed`，自動發布時可排程該貼文（`make.ts:205-207`）。影片的四項 QA 與 Release 均未執行。  
  why missed  -> 新測試的「媒體已存在」案例同時有文章，文章嵌入分支先呼叫了 `released()`。

TOTAL: 1 findings