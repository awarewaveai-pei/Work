Run a thorough code review on all files changed since the last commit.

Steps:
1. Get changed files by running: `git diff HEAD --name-only` and `git diff --cached --name-only`
2. Combine and deduplicate the list.
3. If no changed files found, report "No changes to review."
4. Spawn the **critic** subagent (subagent_type: critic) with this brief:
   "Review these changed files for bugs, security holes, logic errors, edge cases, and performance issues. Every finding must include file:line. Read the full file for context, not just the diff."
5. Present all findings grouped by severity:
   - **CRITICAL** — must fix before committing (security, data loss, broken auth, crashes)
   - **WARNING** — should fix (logic bugs, edge cases, bad patterns)
   - **INFO** — nice to fix (minor style, small improvements)
6. End with a clear verdict:
   - ✅ Safe to commit — no issues found
   - ⚠️ Warnings only — can commit but consider fixing
   - 🚫 Blocked — critical issues must be fixed first
