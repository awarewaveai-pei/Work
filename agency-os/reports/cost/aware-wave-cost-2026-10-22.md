# AwareWave App Cost Report -- 2026-10-22

Window: last 30 days (since 2026-09-22T02:47:32Z UTC). USD->NT$ = 32.
Source: ai_call_logs (exact text spend) + ai_image_jobs (image volume). Unit rates SSOT: lib/ai/cost-model.ts.

## Summary

| Metric | Value |
|---|---|
| Text AI spend (exact) | $1.48 USD / NT$47 |
| Text calls logged | 431 |
| Images generated | 0 |

## Text spend by route (exact cost_usd)

| Route | Calls | In tok | Out tok | USD | NT$ |
|---|---:|---:|---:|---:|---:|
| /cs/generate | 62 | 97609 | 28775 | $0.9659 | NT$31 |
| tools/tarot/generate | 98 | 0 | 0 | $0.294 | NT$9 |
| /cs/supervise | 62 | 83680 | 7516 | $0.1213 | NT$4 |
| /cs/eval/judge | 45 | 25734 | 4668 | $0.0491 | NT$2 |
| /cs/classify | 88 | 24980 | 1985 | $0.0349 | NT$1 |
| /cs/translate | 72 | 13613 | 1087 | $0.019 | NT$1 |
| /api/tools/tarot/translate | 4 | 349 | 50 | $0.0001 | NT$0 |

## Image volume by model

| Model | Count |
|---|---:|
| (no records) | |

Image USD breakdown + monthly estimator: /ops/costs

