# Build step 1 — what is built, what is not yet (one line each; the card line it comes from in 「」)

Owners: S = supervisor session; 甲 MAP+規範與脈絡; 乙 THINK+協作合約; 丙 DECIDE+ACT+LEARN; 丁 GOVERN+完整性核心.

## Foundation (S) — built 2026-10-03
- one write entry `record_log.append`: author / block / owner / per-type version / no score keys; erasure by owner
- a case is read only by its creator (`main._owned_project`), custom workflows only by their maker
- documents (`doc_kinds`, `case_docs`, `/docs` routes), AI gate (`ai_gate`, `/ai` routes), hooks, proposals route
- basic crisis stop + TW/international help (`platform/safety`) — 丁 extends
- built (S): 「呼叫 AI 的兩條路共用同一個權限檢查…命令列那條…要讀案子，一樣要過權限檢查」 — nothing on the command-line path (importers of `ai_execution/gateway.py`) can reach a case store, checked over the whole import graph (`test_block_foundation.AiPathTests`); a command line that needs a case calls `ai_gate.ask_ai`
- NOT YET (S, second wave): the existing tool runs (`main.py` analyses / recipe runs) call the model on a case without the case's 協作合約 check; they move onto `ai_gate` together with 「你先寫，AI 才回」
- built (S): 開案 page (`/projects/{id}/start`): purpose (7, unopened ones show their step), package, reorder/skip, places; high-risk words in the risk add GOVERN's guardrails; proposals stay until answered (`assembler.answer`)
- built (S): 「現在在哪一塊、為什麼在這一塊、下一塊做什麼」 on every block page (`BlockShell` Where/GoOn from GET `/projects/{id}/route`: the intake's order, then accepted proposals); 「你看得到哪幾格做過」 (✓ on the 14 slots); a block already in the case is never proposed again, one standing proposal per block; only the shell links 下一塊 (test_only_the_shell_says_which_block_is_next)
- built (S): 「你同意才加…還沒蓋好…不能加」 on the server: an answer names a proposal of this case, one answer per proposal, 加 only a built block (`block_hooks.BEFORE_SAVE`); 不用 = not proposed again in the case; a proposal's words are the block's own fixed words, the triggering doc by id only (ProposalWordsTests) -- a quote would outlive a deleted card
- built (S): 做過 = event types marked `done` in record_log (a result, a document, a task; never a request, a failure or a tombstone)
- built (S): the AI gate sends the contract's scope / human_parts / basis / handback with every turn and crisis-checks them with the rest; object answers go through `ai_gateway.structured` like every other
- KNOWN LIMIT (S, critic m4): two saves at the same moment can each record a proposal for the same block (check and insert are not one transaction); the person answers both, nothing is lost
- fixed (S, critic M1, 3f26fc502): project name key is (tenant, workspace, creator, name)
- fixed (S, critic M2, 3f26fc502): recipe-run journals live in the runner's folder; erasing a case erases its runs and artifacts
- KNOWN LIMIT: next-admin opens cases as one service identity, so its operators share ownership (critic m6)
- GOVERN 丁: account deletion must also erase person-owned rows (`govern.location`, `/me/docs`) and `CustomWorkflowRepository.delete_person`

## SENSE (S) — built 2026-10-03
- cards (9 categories), edit/delete, groups by drag, timeline, relation links, emotion name + origin + from whom
- strongest emotion + intensity + 4 regulation ways; AI mirror (summary, gaps, explore with the 7 signal questions, one question); confirm / rewrite / drop
- hearsay → proposes VERIFY (recorded; VERIFY opens in step 2)
- NOT YET: 「你用打字或講話寫卡…講話的錄音在我們自己的主機上轉成文字，轉完就刪」 voice input (needs the offline STT on the host)
- NOT YET: 「藝術反思的工具…沒寫停止訊號的，先不給你用」 and 「工具進了這一塊…你先寫，AI 才回」 — the 16 art tools still run the old way
- LATER BY DECISION: 藝術外化 (2026-10-03), 帶領者看哪幾張 (FACILITATE, step 4), 研究同意 (GOVERN step 3)
