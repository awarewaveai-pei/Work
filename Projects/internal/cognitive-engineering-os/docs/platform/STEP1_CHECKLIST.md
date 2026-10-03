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

## MAP (甲) — built 2026-10-03
- six layers each with its question and what it hands over; pick a 拆法 from the 116 tools of the MAP families (search chips, only ones not used in this case), or ask the AI (organize) for up to 3 with a reason; the tool and its version are kept with the map; one line per layer first; skip a layer
- cards into layers by your hand, the AI suggests a layer per card (organize) and you confirm; a feeling, fear or story is never offered as a fact (page + prompt)
- facts show their source count; yours = 「我自己說的，還沒有外部出處」; one source or none stands out; each fact keeps 「在哪裡發生」; a thin outside fact is held back from the AI until you allow it, here and in CONTEXT (CONTEXT has no allow button)
- claims: you mark, or the AI proposes and you confirm, then four columns 事實／法律／價值／文化宗教 with each kind's own detail fields; a law claim without 法域, 時效 or 來源 reads 未確認; 文化宗教 asks for your own understanding before it counts
- 「解不了的局」 8 questions with Farrell's examples + his two reasons; the reading after them is marked ours; the 「解不了的局」 flag is only yours
- core conflict is `human_only`; interests listed per group (the intake's 誰會受影響 first); empty layer and thinnest layer marked by the page (counts, no model call); other readings (needs `propose_options`); gaps, assumptions each tagged who wrote them
- every save is a new version, none deletable; two versions side by side; what you took or dropped of an AI offer is kept (`map.review`); context lens opens from every layer
- hooks: new gap → GATHER, first use of a 拆法 in the case (the old analysis path counts) → TEACH, new checkable claim (事實／法律) → VERIFY, each only for what is new since the last version; high-risk words → GOVERN guardrails, crisis words inside the json lines → help
- NOT YET: 「分到六層的來源卡」 and source counts from source cards — GATHER opens in step 2; today a fact is yours (count 0) and a counted outside fact can only come from step 2
- NOT YET: 「你換方法再拆時，這一步也讀 LEARN 的回顧」 — LEARN's kinds are not built (丙); MAP reads no `learn.*` yet
- NOT YET: 「你選哪一版地圖給帶領者看，記在 GOVERN 的同意紀錄」 — needs FACILITATE (step 4) and GOVERN's consent record (step 3)
- NOT YET: 「工具進了這一塊…你先寫，AI 才回」 — the 116 tools still run the old way (AI first); picking one here links to its page
- KNOWN LIMIT: the model is recorded per AI call (`govern.ai_call`), not per map version; `by` on a line (我／AI／共同) is set by the page, the generic save route cannot check it
- KNOWN LIMIT: `map.map.method_version` is copied by the page from the server's tool list, not stamped by the server

## 規範與脈絡 CONTEXT (甲) — built 2026-10-03
- 15 facets with their one-line meaning, from one versioned list (`FACETS_VERSION`, saved with each note); tick 有關／無關; two questions for each facet that matters; 文化 and 宗教 ask for your own understanding first; add your own facet (kept in your notes) or delete one you added
- places read from the intake and never asked again; 適用哪裡的法律 = places you pick plus your own, several allowed, none chosen for you; each law claim from the map shows 未確認 until it has 法域, 時效, 來源
- four checks: 權利／義務, 規範從哪來, 你的暫定立場 (4 kinds + reason + when to recheck); the third (事實／法律／價值) is MAP's columns and the page says so; the 5 public-issue questions only for the 公共議題判斷 package
- the AI only points at facets not looked at yet (`point_gaps`, always allowed), reads no notes, no stance, no country; MAP's AI reads the ticked facets and the jurisdictions, never the stance (test)
- hook: high-risk words in your notes (a facet you named counts, a built-in facet label does not) → GOVERN guardrails; crisis words inside the facet notes → help
- NOT YET: 「認知作戰／資訊戰的定義、對方目標、打的弱點」 (the long text, 851–859) — lesson content for TEACH (step 4); the page carries the facet's one-line meaning only
- NOT YET: 「哪些法規管得到」 10 tools — stay in the tool catalog and run the old way; the page does not list them; 「你先寫，AI 才回」 as above
- NOT YET: 「各地可以加自己的面向」 shared across cases or places — a facet you add lives in that case's notes
- NOT YET: 「註記也交給 DECIDE，放進判斷卡的『規範脈絡』那一格」 — DECIDE (丙) reads `context.notes`
- built (S): 「每次呼叫 AI 時，系統把發生地和你在哪裡交給 AI；你在協作合約裡可以不給」 -- given unless `collab_contract.terms.hide_places`; an action whose card reads more names it (`AiAction.places`: CONTEXT adds 當事人各在哪裡)
- NOT YET (S, critic m1): 「只推薦這個案子還沒用過的拆法」 is enforced by the page and the AI's input list (the client sends `used`); the AI turn cannot read the map's older versions or the old tool runs to filter on the server

## SENSE (S) — built 2026-10-03
- cards (9 categories), edit/delete, groups by drag, timeline, relation links, emotion name + origin + from whom
- strongest emotion + intensity + 4 regulation ways; AI mirror (summary, gaps, explore with the 7 signal questions, one question); confirm / rewrite / drop
- hearsay → proposes VERIFY (recorded; VERIFY opens in step 2)
- NOT YET: 「你用打字或講話寫卡…講話的錄音在我們自己的主機上轉成文字，轉完就刪」 voice input (needs the offline STT on the host)
- NOT YET: 「藝術反思的工具…沒寫停止訊號的，先不給你用」 and 「工具進了這一塊…你先寫，AI 才回」 — the 16 art tools still run the old way
- LATER BY DECISION: 藝術外化 (2026-10-03), 帶領者看哪幾張 (FACILITATE, step 4), 研究同意 (GOVERN step 3)
