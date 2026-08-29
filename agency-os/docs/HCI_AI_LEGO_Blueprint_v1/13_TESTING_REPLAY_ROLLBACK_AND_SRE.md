> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/13_TESTING_REPLAY_ROLLBACK_AND_SRE.md. See 00_README.md in this folder for why.

# 13 — Testing, Replay, Rollback & SRE

## Testing layers

Required:

```text
Unit
Integration
Contract
E2E
Security
Bias
Calibration
Counterfactual
Replay
Restore
Decision Safety
Architecture Rules
```

## Architecture tests

Examples:

1. tenant-owned entity must have `tenant_id`
2. HCI core may not import billing provider
3. HCI core may not import AI vendor
4. no direct DB dependency between HCI and Cognitive OS
5. sensitive tables require audit
6. peer products communicate only by contract/API/event

## Counterfactual tests

Given identical behavior data, changing irrelevant identity features must not alter unrelated analysis.

## Calibration

Track:

```text
False Positive
False Negative
Precision
Recall
Calibration
```

Use historical outcomes to determine whether risk models are systematically over- or under-sensitive.

## Model disagreement

Never silently average incompatible conclusions.

Use:

```text
MODEL_DISAGREEMENT
```

and explain why.

## Replay

Historical decision reproduction should preserve:

```text
Historical HCI evidence
HCI method version
HCI policy version
AI LEGO Atlas hash
AI LEGO workflow version
AI model metadata
Decision policy
```

## Shadow mode

New model/method/workflow versions should support:

```text
Production: old version
Shadow: new version
```

Compare:
- quality
- calibration
- bias
- latency
- cost
- source coverage
- contradiction handling

Cut over only after acceptance criteria are met.

## Database migration

Use Expand / Contract:

```text
Expand
→ Dual compatibility
→ Backfill
→ Validate
→ Cutover
→ Observe
→ Contract
```

No destructive one-step migration for critical data.

## Rollback dimensions

Every release must define:

```text
Application rollback
Database rollback / forward recovery
Configuration rollback
Policy rollback
Prompt rollback
Method rollback
Workflow rollback
```

## Backups

At minimum consider:

```text
Primary
Replica
Offsite backup
Offline / immutable backup
```

Backup is not recovery.

Restore testing is mandatory.

## Disaster recovery scenarios

At least:

```text
DB loss
credential leak
ransomware
operator error
bad deployment
bad migration
cloud outage
region outage
AI provider outage
search provider outage
```

## Graceful degradation

If AI LEGO is down, HCI should still support:
- historical reads
- manual evidence
- manual assessment
- existing decisions

If public search is down, HCI should still support:
- first-party evidence
- manual source input
- historical public intelligence

If one model is down:
- use approved substitute if policy allows
- otherwise hold for review
- never silently substitute forbidden models

## SLOs

Define at least:

```text
Availability
Latency
Data Durability
Backup Success
Restore Success
Security Response
Critical Workflow Success
```
