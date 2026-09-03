#!/usr/bin/env python3
from semantic import *
from pathlib import Path
import tempfile, hashlib, sys

def expect_fail(fn,name):
    try: fn()
    except Exception: return
    raise AssertionError(name+' unexpectedly passed')

def main():
    # Risk lies about max dimension.
    expect_fail(lambda: validate_risk({'dimensions':{k:4 for k in ['data','privilege','blast_radius','reversibility','customer','regulatory','financial','criticality','novelty','uncertainty']},'computed_risk_tier':'R0'}),'risk escalation')
    # Authority below deterministic minimum.
    expect_fail(lambda: validate_authority({'risk_tier':'R4','required_authority':'A4','granted_authority':'A2','approval_evidence':['x']}),'authority downgrade')
    # Critical irreversible action without controls.
    expect_fail(lambda: validate_human_action({'risk':'CRITICAL','reversibility':'IRREVERSIBLE','authority_required':'A0','confirmation':False,'dual_control':False,'audit_required':False}),'human safety bypass')
    # Non-waivable exception.
    expect_fail(lambda: validate_exception({'violated_rule':'EVIDENCE_INTEGRITY','starts_at':'2026-01-01','expires_at':'2026-02-01','monitoring':['m'],'evidence':['e'],'permanent_target_fix':'f','removal_task':'r','rollback':'rb','compensating_controls':['c']},{'EVIDENCE_INTEGRITY'}),'non-waivable exception')
    # Retired without retirement proof.
    expect_fail(lambda: validate_lifecycle({'state':'RETIRED'}),'lifecycle bypass')
    # R4 release without approval/evidence.
    expect_fail(lambda: validate_release({'risk_tier':'R4','version':'1','source_revision':'abcdefg','artifact_digest':'0'*64,'change_set_ref':'c','test_evidence':['t'],'rollback':'rollback','rollback_thresholds':['x'],'observability':['o'],'approvals':[],'deployment_strategy':'CANARY','sbom_digest':'1'*64,'provenance_digest':'2'*64,'release_notes_ref':'r','post_release_checks':['p']}),'release approval bypass')
    # Evidence reverse range/path traversal.
    bad={'state':'VERIFIED','repository_revision':'abcdefg','observed_at':'2026-01-01T00:00:00Z','observed_by':'x','evidence':[{'path':'../x','start_line':3,'end_line':1,'blob_sha256':'0'*64,'content_sha256':'1'*64,'proves':'x'}]}
    expect_fail(lambda: validate_evidence(bad),'evidence traversal/reverse range')
    print('ADVERSARIAL CONTRACT TESTS: PASS')
    return 0
if __name__=='__main__': sys.exit(main())
