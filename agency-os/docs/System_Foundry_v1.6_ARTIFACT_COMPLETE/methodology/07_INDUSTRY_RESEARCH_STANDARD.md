# Industry Research Standard

## Purpose
確認這個問題在目標產業中已經怎麼被解決，避免重新發明一個產業已經有更好答案的輪子——並誠實記錄「我們選擇不照抄的地方，以及為什麼」。

## Sequencing
Step 07. Runs in parallel with or just after `05_ARCHITECTURE_OPTIONS.md` / `06_EXPERT_COUNCIL_STANDARD.md`, stress-testing the candidate options against real industry practice. Feeds `08_CROSS_INDUSTRY_RESEARCH.md` and `09_FALSIFICATION_STANDARD.md`.

## Required Scope
- competitors
- market standards
- failure patterns
- enterprise expectations
- commercial models

## Required Fields
1. **Competitor/incumbent survey** — how established players in this industry solve the same problem, with source diversity (not one vendor's marketing page as the only source).
2. **Market standards** — de facto or formal standards this industry expects (compliance regimes, data formats, integration protocols).
3. **Known failure patterns** — documented ways similar systems have failed in this industry, so the architecture options can be checked against them.
4. **Enterprise expectations** — what an enterprise buyer in this industry assumes exists by default (SSO, audit logs, SLAs — `commercial/ENTERPRISE_STANDARD.md`), even if the initial target segment is smaller.
5. **Commercial model precedent** — how similar solutions are priced/packaged in this industry, informing `commercial/EDITION_ARCHITECTURE.md` decisions later.
6. **Explicit non-adoption record** — for every industry pattern deliberately NOT copied, a one-line reason why.

## Recency and Source Requirement
Sources MUST be dated; research older than a documented freshness threshold for a fast-moving area MUST be re-verified (`assurance/POLICY_FRESHNESS_STANDARD.md`).

## Gate
This step has no dedicated entry in `runtime/stage-gates.yaml` of its own — it is raw material for `09_FALSIFICATION_STANDARD.md`, `10_RED_TEAM_STANDARD.md`, and `11_COMPLEXITY_AUDIT.md`, which jointly satisfy `G7_FALSIFICATION_COMPLETE`. This step's own local check: reject research that relies on a single source, that has no failure-pattern analysis, or where a deliberately-rejected industry pattern has no recorded reason.
