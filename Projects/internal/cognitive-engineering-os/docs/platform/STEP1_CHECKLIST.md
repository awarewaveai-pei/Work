# Build step 1 — what is built, what is not yet (one line each; the card line it comes from in 「」)

Owners: S = supervisor session; 甲 MAP+規範與脈絡; 乙 THINK+協作合約; 丙 DECIDE+ACT+LEARN; 丁 GOVERN+完整性核心.

## Foundation (S) — built 2026-10-03
- one write entry `record_log.append`: author / block / owner / per-type version / no score keys; erasure by owner
- a case is read only by its creator (`main._owned_project`), custom workflows only by their maker
- documents (`doc_kinds`, `case_docs`, `/docs` routes), AI gate (`ai_gate`, `/ai` routes), hooks, proposals route
- basic crisis stop + TW/international help (`platform/safety`) — 丁 extends
- NOT YET (S): 「呼叫 AI 的兩條路共用同一個權限檢查」 the CLI path (`ai_execution/gateway.py`) does not go through `ai_gate`
- built (S): 開案 page (`/projects/{id}/start`): purpose (7, unopened ones show their step), package, reorder/skip, places; high-risk words in the risk add GOVERN's guardrails; proposals stay until answered (`assembler.answer`)
- NOT YET (S): 「現在在哪一塊、為什麼、下一塊」 on every block page; an accepted proposal shown in the case's block list
- OPEN (S, critic 2026-10-03 M1): project name UNIQUE(tenant, workspace, name) tells a colleague that a case with that name exists -> rebuild with the owner in the key
- OPEN (S, critic 2026-10-03 M2): recipe-run journals are tenant-scoped (`main.workflow_journal_path`): another person can read a run on my case by run_id; erasing a case leaves its run journals/artifacts -> owner-scoped journal dir + per-run project/artifact sidecar, erase deletes them
- KNOWN LIMIT: next-admin opens cases as one service identity, so its operators share ownership (critic m6)
- GOVERN 丁: account deletion must also erase person-owned rows (`govern.location`, `/me/docs`) and `CustomWorkflowRepository.delete_person`

## SENSE (S) — built 2026-10-03
- cards (9 categories), edit/delete, groups by drag, timeline, relation links, emotion name + origin + from whom
- strongest emotion + intensity + 4 regulation ways; AI mirror (summary, gaps, explore with the 7 signal questions, one question); confirm / rewrite / drop
- hearsay → proposes VERIFY (recorded; VERIFY opens in step 2)
- NOT YET: 「你用打字或講話寫卡…講話的錄音在我們自己的主機上轉成文字，轉完就刪」 voice input (needs the offline STT on the host)
- NOT YET: 「藝術反思的工具…沒寫停止訊號的，先不給你用」 and 「工具進了這一塊…你先寫，AI 才回」 — the 16 art tools still run the old way
- LATER BY DECISION: 藝術外化 (2026-10-03), 帶領者看哪幾張 (FACILITATE, step 4), 研究同意 (GOVERN step 3)
