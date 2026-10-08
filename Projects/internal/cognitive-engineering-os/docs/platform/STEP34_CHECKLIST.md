# Steps 3 and 4 checklist

## TEACH

- [x] Lessons and low-risk practice cases are reviewed content files under `ai_lego/platform/lessons/`, not database rows.
- [x] `load_lessons()` and `load_practice_cases()` validate every YAML file, source check state, subject, course order, and `HISTORY.json` fingerprint; cases not yet checked are shown as such, never given an invented date.
- [x] `rulesets/teach.py` exposes both TEACH rulesets through normal discovery.
- [x] Draft lessons remain visible to content callers, while `reviewed_only()` excludes them from reviewed-only callers.
- [x] `generate_lessons.py` reads the existing tool catalog and example registry, makes no model call, is deterministic, and never overwrites.
- [x] The required independent-origins lesson, seven package course entries, three generated tool fixtures, and four publisher-backed example cases are present.
- [x] Loader and generator refusal classes have unit tests, including fingerprint, minutes, source, reviewed-draft, and write-once mutations.
- [x] Person-owned `teach.run`, `teach.aar`, and `teach.practice_consent` records use generic `/me/docs/{kind}` routes; practice consent is tied to a real case and erased with it; completion is system-only, deletable by the person, and the hook respects the person's default-keep opt-out after every required lesson has a run.
- [x] 「練習紀錄」記下上過哪些課與練習案例做到哪；預設保留，但本人可以選擇不留，也可以刪除完成紀錄。
- [x] TEACH's AI opponent and thinking-move feedback read only the selected lesson, checked practice case, run notes, and consent guard; their output has no score or ranking fields and real-case context needs consent.
- [x] Lesson and practice-case reads include drafts, prefer the person's `govern.location`, and explain the fallback when no local case exists.
- [x] TEACH page is a case-free `/me/teach` surface: visible subject, lesson, case, role and action controls use design-system classes, and the person's words stay beside tagged AI output.
- [ ] The 90-second manipulation-technique content is not invented here; it remains operator-reviewed content work from the confirmed card.
- [ ] 情境演練、共同實作空間，以及 GOVERN 高風險護欄串接尚未建置；這些是未完成的 TEACH 工作，不以內容文字冒充已完成。

## EXPRESS

- [x] The person selects a reader, format, key points and case-owned records; the save hook re-checks every `{project_id, kind, doc_id}` against the current case.
- [x] The eight formats are a versioned `express.formats` ruleset with sections and an assumed reader.
- [x] The outline route and builder use only selected records; every node carries its selected record refs, and pasted words are omitted from the outline for the quoted gate.
- [x] `draft_from_outline` and `adjust_for_reader` read the selected records and live status from `evidence.checked_claims()`; they refuse a missing ref or a ref outside the selection.
- [x] Every saved draft sentence has text, at least one selected ref, an author and an unchecked flag; AI sentences are always stored as `author: "ai"`; a person cannot remove an unchecked claim's marker through the generic save route.
- [x] A claim that is not usable as fact or has fewer than two independent origins is saved with `unchecked: true`; the handback question occurs before the model call until the person saves `unchecked_ok: true`.
- [x] The person's confidence and uncertainty text is included unchanged; selected `verify.message` text reaches the model only through `AiAction.quoted` after the crisis check, and selected sources are narrowed for the citation gate.
- [x] `express.sent` is user-only, points to a saved draft and version in this case, and is not written by the EXPRESS AI actions or hook; selection CRUD, outline, draft listing, format listing and version routes are covered.
- [x] EXPRESS exports each draft in Markdown, plain text, and PDF with sentence marks and a final confidence/uncertainty section; export is read-only and the send route records the person's confirmed version only after the read and acknowledgement gates.
- [x] EXPRESS has no automatic delivery path: no recipient service is called; `.docx` is deliberately not built in this card, and group sharing belongs to the next card.
- [x] The person-facing EXPRESS page keeps reader, format, key points, checked case records, outline, sentence sources, unchecked and AI marks, confidence, uncertainty, exports, and the person-confirmed send flow on one screen; it uses the existing EXPRESS routes and design-system classes.
- [ ] The EXPRESS group proposal button is waiting for card 20 because `collab.proposal` is not present in this worktree's `ai_lego` tree; no case record is shared by this card.

## FACILITATE

- [x] Facilitator scripts are versioned YAML content under `ai_lego/platform/scripts/`, loaded as `facilitate.scripts`, with the card's four-item dont list as `FACIL_DONTS` (`dont-list.yaml`).
- [x] A script records each step's wording, minutes, donts and stop signals, plus an escalation path to GOVERN resources.
- [x] A subject with no stop signal in any step is excluded from `available_subjects()` and reported as `沒有停止訊號`.
- [x] Draft scripts never appear in `usable_for_leading()`; the three seed scripts remain drafts until operator review.
- [x] The CSV importer maps operator-selected headers, writes drafts, preserves empty stop-signal cells as empty lists, reports those rows, and never calls a network client.
- [x] card 60b: facilitator course has three draft lessons for leading, the fixed FACIL_DONTS, and escalation to GOVERN; the TEACH loader and completion shape accept the special `facilitator` course.
- [ ] Showing `FACIL_DONTS` on screen the whole time someone leads belongs to the later FACILITATE page card; this card supplies the list.

## GOVERN (cards 30-33)

- 30 appeals: `govern.appeal` (platform-owned, anonymous by default), `visibility.appeals_for` (author / appeal_handler /
  supervisor / nobody else), `/me/appeals` + `/govern/appeals`; account erasure removes the appeals its person wrote.
  - Not built: the supervisor reader class (`visibility._supervisees` is empty until card 61 makes `facilitate.supervision`
    real; its test is skipped with reason "card 61").
- 31 research export: `platform/research_export.py` + CLI `apps/cli/research_export.py` + migration `0007_research_exports.py`
  (COLLAB takes 0008). No web route.
  - Not built: FACILITATE drift records are read only once card 61 registers `facilitate.log` (tested with a stand-in).
- 32 no record, resources per place, audit line: `assembler.intake.no_record`; `POST /projects/{id}/govern/close` (no close
  action existed before; it erases a 不留紀錄 case, and every erase of such a case leaves no tombstone);
  `platform/resources/` (台灣 + 國際通用, versioned, sourced); `GET /projects/{id}/govern/used`.
  - Not built: device-only mode (§10); resource files for other places (localisation content); 112 / 911 / 999 is
    marked 尚未查核 (`resources.unchecked()`).
- 33 pages: `/me/data` (`MyDataPage.tsx`: consents with preview and withdraw, appeals, research, export / erase) and on
  the case's GOVERN page the audit line and the 不留紀錄 switch.
  - Not built: the switch on the intake page itself (`IntakePage.tsx` is S's); the page walk at 1280 / 400 wide (§16,
    end of the wave).


## COLLAB (cards 20-22)
- built (card 20): §7's kinds in `kinds/collab.py`, all the group's, each naming its visibility; routes `apps/api/blocks/collab.py` (list / new / next version / delete / versions per kind; views dissent, authority, shared; handoff); COLLAB's checks `block_hooks/collab.py` run as the save's batch check under the group lock held exclusive (`CaseDocs.save_many` now takes a check for a group owner)
- built: 「每個人先各自寫自己的立場。寫完，才看得到別人的」「做共同決定之前，每個人先各自回答這 5 個問題…寫完才看得到別人的」 -- `blind="round"` on position, change, interface answers; the convener is not exempt; by id too
- built: 「各自寫完之前，系統不顯示多數意見」 -- `collab.stance` is blind by `option` (a field the card's line needs): another member's mark on an option is shown once you marked it; so is its kept dissent
- built: 「你們對每個方案標同意或異議，並寫理由」「系統把異議和理由存下來。異議不會被多數蓋掉」 -- one live stance per (member, option), reason required, every version kept; each 異議 version leaves a `collab.dissent` (system, after_close) naming the stance and its version (a pointer: the reason and the name are read from them each time); nobody but the writer versions a record (`COLLAB_NOT_YOURS`), a stance and a dissent are never deleted
- built: 「每個參與者在哪裡，只有他本人和 GOVERN 讀得到」 -- `collab.place` `self_and_govern`, one per member
- built: anonymity of a dissent -- `collab.label` {label}, one per member, 匿名 allowed; every answer shows `who` (你 / the label / the name) and never another member's identity, so a label holds wherever the member's records appear
- built: 「授權可以收回。每個人收回的是自己那一份。例：三個人授權給甲，乙收回後，甲只代表兩個人；範圍要重新談」 -- one `collab.authority` = one grantor's share (its writer); `revoked_by` holds only the writer's own id and stays; the view recomputes who represents whom from the shares still given; a share taken back leaves `collab.renegotiate` (system, pointer) shown as 「範圍要重新談」
- built: 「你們一起訂：什麼情況結束討論、什麼情況重新開」「系統記下結束討論的理由、重開條件、檢討日期、負責的人」 -- `collab.closing` needs all four; a convener writes it
- built: 「任何參與者都可以提出重開」 -- `collab.reopen` by any member, never deleted, the group's status unchanged; DECISION: also accepted once the group is closed (`after_close`), following the card text over card 20 (8)'s list -- otherwise the convener's close would refuse a reopening
- built: 「系統之後把決定的後果寫回來，帶進下一輪」 -- `collab.consequence` and `collab.review`, both after_close (the page offers them: card 22)
- built: 「這一步讀：每個參與者同意分享的地圖、查證結果、提案」「ACT 的觀察紀錄（只讀群組決定之後的觀察）」「開案資料裡誰會受影響（只讀這一項）」「絕不讀：參與者沒分享的個人案子」 -- view `shared` reads only `visibility.shared_with`, keeps MAP / VERIFY / EXPRESS records whole, `act.note` only after the group's first closing, of `assembler.intake` only `affected`, drops the rest
- built: 「共同的判斷交給 DECIDE。要做的行動交給 ACT」 -- POINTER ONLY: `collab.handoff` {group_id, closing, to} in the convener's own case; the closing is read through the group each time. Not a DECIDE judgment draft or an ACT task: `decide.judgment` is the person's own words field by field (human_only) and one per case, so a copy of the group's words cannot stand in it; the DECIDE and ACT pages do not show the pointer yet
- built: the interface questions are `kinds/context.py` `INTERFACE_QUESTIONS` (a test compares them with the card file): FIVE, as the card text says; card 20 said six
- built: an account erasure takes the member's dissent and renegotiation notices too (written as the system on their behalf, so `delete_written_by` removes them)
- built (card 21): 「任何『大家怎麼看』的顯示都不用票數決定，要看平常意見不同的人是不是都同意；並排除少數大量投票的人再算一次」 -- `platform/collab_agreement.py` (pure; ruleset `collab.agreement` v1): 2-means on stance vectors (now + earlier rounds), ties by member id, agreed only with an agree on each side and no objection, a second table without the top 10% markers from 10 members on, held members left out and listed, under 3 / under 2 options / no split = 「還不夠看出誰跟誰不同」; view `agreement` shows it only for the options the viewer marked
- built: 「AI 整理大家的分歧」 -- `organise_differences`, saved as `collab.differences` for the one who asked only (author_only); 「AI 轉述每一方的立場。每一方本人確認說得對不對」 -- `restate_positions`, one `collab.restatement` per call about one position, its record carries the subject's identity; others read it only after the subject's `collab.confirm` 說得對 and only if they may read the position (`subject_confirmed` in visibility.py); not even the requester reads it before
- built: 「AI 不准代表任何一方／宣布共識／藏起少數意見／給參與者排名」 -- instructions, no count or rank field, and the AI cannot author `collab.stance`
- built: 「交還控制：有人提出異議或要求重開時，AI 停下來」 -- an objection or reopen the page did not show (`seen`) stops the turn before the model, saying whose turn it is; 「有人說自己的立場被轉述錯了，AI 停下來，交回給他本人」 -- the subject's latest answer 說錯了 stops restating them for anyone else; they restart it themselves. The 說錯了 record itself is the hand-back record (no second copy)
- built: 「出現自傷、暴力、急性危機的訊號時，AI 停下來…照那位參與者在哪裡給當地的求助資源」 -- the gate's crisis check on the caller's own words, resources for their `collab.place` (else their 你在哪裡); integrity's crisis probe now runs group actions in a real group
- built: the AI gate's group path (`ai_gate.py` `in_group`, `fill`, `subject_field`): a current member only, always-allowed permissions only (a group has no 協作合約), reads through visibility.py with other members' words removed; those reach the model only fenced (QUOTED), after the crisis check
- DECISION: 「AI 指出還沒被聽到的人」 is computed, not asked of the model (view `not-heard`: names only, never what anyone wrote); the page tags it 系統, not AI
- NOT YET: 「系統畫出分歧地圖」 as a drawing -- the positions, options (evidence, risks, values trade-off) and stances are side by side on the page (card 22)
- NOT YET: 「系統確認每個參與者是受邀的那個帳號」「一個人用多個帳號，由 GOVERN 的帳號檢查擋」 -- cards 12 (invitations) and GOVERN, not COLLAB
- NOT YET: 「公共決策怎麼量，只量過程」 -- the process indicators are card 70
- NOT YET: 「治理支線：提案／報表 → 共同審議 → 授權、退回或重開 → 行動 → 回顧」 -- `collab.proposal` is stored; EXPRESS's link to it is EXPRESS's card
- built (card 22): pages `/groups` (`GroupsPage.tsx`: my groups; a new group by name and purpose buttons; a convener's one-time invitation link shown once 「這個連結只出現這一次」 with a copy button; open invitations taken back) and `/groups/[id]` (`CollabPage.tsx`, in the card's order: question with every wording, own position first, what changed, interface answers, options side by side with 同意 / 異議 and a reason, kept dissent and how it is signed, authority with 「收回我那一份」 and 「範圍要重新談」, closing's four fields, 要求重開 always there, 大家怎麼看 both tables, members waiting for the convener and why, AI help with every AI text tagged, restatements to their subject first with 說得對 / 說錯了, consequences and reviews, my place); header 「這是程序工具。它不保證公平，也不保證大家真的同意。」; `lib/groups.ts`
- built: 「寫完，才看得到別人的」 on the page -- a blind kind is asked `?mine=true` until your own of the round is saved; the full list is not even requested before, and nothing but your own is drawn from that answer (route gained `mine`; `POST .../collab.authority/{id}/revoke` takes back the caller's own share)
- NOT CHANGED: `lib/blocks.ts` -- COLLAB's entry already exists (step 3); groups are reached at `/groups`, not from a case's block list
- NOT YET: a link to 我的群組 in the main menu (`AppNav.tsx`); choosing an option's evidence from shared records (`evidence_refs` is stored and checked, the page has no picker); the page walk at 1280 and 400 wide (§16, end of the wave)
