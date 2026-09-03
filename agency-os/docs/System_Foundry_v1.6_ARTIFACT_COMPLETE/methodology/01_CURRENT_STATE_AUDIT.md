# Current State Audit Standard v1.1

## Purpose
建立可驗證的 current truth；沒有完成 current truth，不得設計 existing-system target state。

## Required Scope
- repository inventory and entry points
- runtime/services/process topology
- authoritative source of truth
- DB/schema/data ownership
- DNS/proxy/network boundaries
- IAM/tenant/authorization flow
- CI/CD/deployment
- secrets/configuration/policy ownership
- monitoring/alerts/SLOs
- backup/restore/DR
- incidents/debt/known failures
- external dependencies and side effects

## Evidence Requirement
Every repository factual finding uses `schemas/evidence-finding.schema.json`. `VERIFIED` requires exact repository-relative `path:start_line-end_line` plus `proves`. No exact evidence -> no verified claim.

## Audit Output
- repository inventory
- source-of-truth map
- dependency map
- ownership map
- request/data/control-flow traces
- evidence register
- known unknowns
- contradictions/disputed evidence
- root-cause investigation queue

## Gate
G1 fails on `INSUFFICIENT_EVIDENCE` or `CURRENT_STATE_NOT_UNDERSTOOD` for any area material to the requested change.
