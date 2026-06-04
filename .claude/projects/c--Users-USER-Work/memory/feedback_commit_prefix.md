---
name: Commit message prefix
description: Always prefix commit messages with [claude] so user can identify AI-authored commits
type: feedback
originSessionId: c637c61b-919d-43e2-b9e4-562d3405452b
---
Always start commit messages with `[claude]` prefix.

**Why:** User wants to distinguish AI commits from their own in git history.

**How to apply:** Every commit I create should look like:
`[claude] fix(node-api): guard Sentry init behind DSN env var check`
