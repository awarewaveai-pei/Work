# Card 51 — EXPRESS: export formats and the person's own send

## Decision
Required reading: card 50 and `docs/platform/step34-cards/EXPRESS.card.txt` lines on 「匯出」, 「交還控制」, 「你自己按送出」. The system exports in the formats the person needs; leaving the system happens only by the person pressing send. Research data and the whole-judgment export belong to GOVERN (not here).

## Constraints
- `COS/ai_lego/platform/exports/`: renderers from a draft to Markdown (`.md`), plain text, and PDF (reuse the existing report PDF code: find it with `grep -rn "pdf" ai_lego/apps/api/main.py ai_lego/platform` and use the same library; add no new dependency without a `DECISION_NEEDED:`). A `.docx` renderer is NOT built here (note it in the checklist). Each renderer: every sentence in order; an `unchecked` sentence carries a visible mark 「（還沒查證）」 in the output; AI-written sentences carry a visible mark 「（AI 寫的）」 unless the person rewrote them (`author` became `user`); the person's confidence and the open uncertainties of the draft are printed in a final section, never dropped. File names: ASCII, no personal data.
- Routes: `POST /projects/{id}/express/drafts/{draft}/export?format=` returns the bytes with `Content-Disposition: attachment` and records nothing. `POST .../send` records `express.sent` with the version the person confirmed (`version` must equal the draft's current version, else 409 with words) and returns the same export; there is NO endpoint that sends on the person's behalf, no email, no webhook, no scheduled send. A gate test scans the `express` route module and `platform/exports/` for `smtp`, `requests`, `urllib`, `webhook`, `schedule`, `cron` and fails on any.
- Before send: if the draft contains `unchecked` sentences or a sentence the person never read (each sentence has `seen: bool` set by the page when displayed; keep it simple: the draft version must have been fetched by the person at least once since the last change, recorded as `express.draft` field `last_read_version` written by the read route), the send route refuses with a question 「稿子裡還有還沒查證的句子，確定要送？」 unless the body has `acknowledge_unchecked: true`.
- Nothing from a draft is shared with a group or a facilitator by this card (the group proposal link is card 52).

## Files
`ai_lego/platform/exports/__init__.py`, `ai_lego/platform/exports/render.py`, `ai_lego/apps/api/blocks/express.py` (add routes), `tests/unit/test_express_export.py`, `docs/platform/STEP34_CHECKLIST.md`, `agency-os/reports/review-debt.md`.

## Acceptance
`tests/unit/test_express_export.py`: each format contains every sentence in order with the right marks; the confidence section is present; send needs the current version (409 otherwise) and needs `acknowledge_unchecked` when unchecked sentences exist; `express.sent` is written only by the send route; the no-outbound scan passes on the real tree and fails on a temp copy containing `import smtplib`; an export writes no record; the PDF starts with `%PDF`. Mutations: drop the mark on unchecked -> red; drop the version check -> red; add an `import urllib.request` to the route module -> the scan red; write `express.sent` in the export route -> red.
