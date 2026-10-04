# Gates

A card with `"gate": "<name>"` in `queue.json` does not start until the file `gates/<name>` exists in the MAIN checkout (`D:/Work`). A gate is created by the person (or Claude session) who has seen the condition become true, with `New-Item` / `touch` and one line of evidence inside (commit hash, date). It is a file, not a flag in a database, so it is visible in `git status` and reviewable.

- pg-port-merged: the storage port (record_log, case_docs, project_source_repository, identity store, region directory) is merged on main, the tests run on PostgreSQL, and `grep -rn sqlite3 ai_lego tests` is empty or each hit is justified.
- step2-closed: GATHER, VERIFY and COMPUTE rounds are merged on main with every review finding closed or rejected with evidence, and the full engine test list is green on main.
- step34-frozen: `COS/docs/platform/STEP34_SHARED_RULES.md` exists, every decision in it is closed, and the operator has seen the 5 block cards of steps 3 and 4.
