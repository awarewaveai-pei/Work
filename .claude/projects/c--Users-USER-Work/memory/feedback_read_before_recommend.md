---
name: feedback_read_before_recommend
description: "Read all relevant existing files before recommending changes to them — R0 applies to analysis too, not just code writing"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ef93fe56-a7cf-4762-9862-0f4aa27ebf41
---

When suggesting improvements to any skill, agent, command, or config file, read the actual file first — even if the recommendation seems obviously correct from an external source (article, best practice doc, etc.).

**Why:** Recommended a "do-not-flag list" for the review command based on a Cloudflare article, without first reading `review.md` or `critic.md`. The critic agent already had comprehensive checklist + AwareWave stack checks. The recommendation was partially redundant and would have been much better targeted had the files been read first. User had to ask "你有去讀所有的 SKILL 和 AGENT 嗎?" before I caught it.

**How to apply:** Before saying "we should add X to our Y," read Y first. R0's "未讀現有邏輯即重寫" applies to analysis and recommendations, not just code writing. If the scope is broad (e.g., "all skills and agents"), use Glob to enumerate then Read in parallel before forming opinions.
