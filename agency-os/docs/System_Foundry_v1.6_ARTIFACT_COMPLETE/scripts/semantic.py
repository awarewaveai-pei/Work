from __future__ import annotations
from pathlib import Path
import hashlib, json
from datetime import datetime, timezone

RISK_ORDER={f"R{i}":i for i in range(5)}
AUTH_ORDER={f"A{i}":i for i in range(5)}

class SemanticError(ValueError): pass

def load_jsonish(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))

def sha256_bytes(data: bytes)->str: return hashlib.sha256(data).hexdigest()
def sha256_file(path: Path)->str: return sha256_bytes(path.read_bytes())

def compute_risk_tier(dimensions: dict)->str:
    required={'data','privilege','blast_radius','reversibility','customer','regulatory','financial','criticality','novelty','uncertainty'}
    if set(dimensions)!=required: raise SemanticError('risk dimensions must match canonical set')
    vals=list(dimensions.values())
    if any(type(v) is not int or v<0 or v>4 for v in vals): raise SemanticError('risk dimension out of range')
    return f"R{max(vals)}"

def validate_risk(record: dict):
    expected=compute_risk_tier(record['dimensions'])
    if record.get('computed_risk_tier')!=expected: raise SemanticError(f"computed_risk_tier must be {expected}")
    return True

def required_authority_for_risk(risk: str)->str:
    if risk not in RISK_ORDER: raise SemanticError('unknown risk tier')
    return f"A{RISK_ORDER[risk]}"

def validate_authority(record: dict):
    req=required_authority_for_risk(record['risk_tier'])
    if record.get('required_authority')!=req: raise SemanticError(f"required_authority must be {req}")
    grant=record.get('granted_authority')
    if grant not in AUTH_ORDER or AUTH_ORDER[grant] < AUTH_ORDER[req]: raise SemanticError('granted authority is insufficient')
    if not record.get('approval_evidence'): raise SemanticError('approval evidence required')
    return True

def validate_evidence(record: dict, repo_root: Path|None=None):
    if record.get('state') in {'VERIFIED','INFERRED'}:
        for k in ['repository_revision','observed_at','observed_by','evidence']:
            if not record.get(k): raise SemanticError(f'{k} required')
        if not record['evidence']: raise SemanticError('evidence required')
    for ev in record.get('evidence',[]):
        rel=ev['path']
        p=Path(rel)
        if p.is_absolute() or '..' in p.parts: raise SemanticError('evidence path traversal/absolute path forbidden')
        s,e=ev['start_line'],ev['end_line']
        if e < s: raise SemanticError('end_line must be >= start_line')
        for key in ['blob_sha256','content_sha256']:
            if len(ev.get(key,''))!=64: raise SemanticError(f'{key} must be sha256')
        if repo_root is not None:
            fp=(repo_root/p).resolve(); rr=repo_root.resolve()
            if rr not in fp.parents and fp!=rr: raise SemanticError('evidence escaped repository root')
            if not fp.is_file(): raise SemanticError('evidence file missing')
            raw=fp.read_bytes()
            if sha256_bytes(raw)!=ev['blob_sha256']: raise SemanticError('blob hash mismatch')
            lines=fp.read_text(encoding='utf-8').splitlines(keepends=True)
            if e>len(lines): raise SemanticError('line range exceeds file')
            selected=''.join(lines[s-1:e]).encode()
            if sha256_bytes(selected)!=ev['content_sha256']: raise SemanticError('content hash mismatch')
    return True

def validate_human_action(r: dict):
    if r['risk']=='CRITICAL':
        if r.get('authority_required')!='A4' or not r.get('confirmation') or not r.get('dual_control') or not r.get('audit_required'):
            raise SemanticError('critical action requires A4 + confirmation + dual control + audit')
    if r['reversibility']=='IRREVERSIBLE' and (not r.get('confirmation') or not r.get('audit_required')):
        raise SemanticError('irreversible action requires confirmation and audit')
    return True

def validate_exception(r: dict, non_waivable: set[str]):
    required=['starts_at','expires_at','monitoring','evidence','permanent_target_fix','removal_task','rollback','compensating_controls']
    for k in required:
        if not r.get(k): raise SemanticError(f'exception missing {k}')
    if r['violated_rule'] in non_waivable: raise SemanticError('rule is non-waivable')
    if r['expires_at'] <= r['starts_at']: raise SemanticError('exception expiry must be after start')
    return True

def validate_lifecycle(r: dict):
    st=r['state']
    req={
      'DEPRECATED':['replacement','compatibility_until','consumer_evidence'],
      'RETIRING':['replacement','consumer_evidence','migration_recipe','communication_evidence','rollback'],
      'RETIRED':['consumer_evidence','migration_recipe','communication_evidence','removal_criteria','retention_decision','rollback']}
    for k in req.get(st,[]):
        if r.get(k) in (None,'',[]): raise SemanticError(f'{st} requires {k}')
    return True

def validate_release(r: dict):
    required=['version','source_revision','artifact_digest','change_set_ref','test_evidence','rollback','rollback_thresholds','observability','deployment_strategy','sbom_digest','provenance_digest','release_notes_ref','post_release_checks']
    for k in required:
        if r.get(k) in (None,'',[]): raise SemanticError(f'release missing {k}')
    min_approvals=0 if r['risk_tier'] in {'R0','R1','R2'} else (1 if r['risk_tier']=='R3' else 2)
    if len(r.get('approvals',[]))<min_approvals: raise SemanticError('insufficient release approvals')
    return True

def validate_dag(stages: list[dict]):
    ids=[s['id'] for s in stages]
    if len(ids)!=len(set(ids)): raise SemanticError('duplicate stage id')
    known=set(ids); graph={s['id']:set(s.get('depends_on',[]))|set(s.get('optional_dependencies',[])) for s in stages}
    for n,deps in graph.items():
        bad=deps-known
        if bad: raise SemanticError(f'{n} references missing dependencies: {sorted(bad)}')
    temp=set(); done=set()
    def visit(n):
        if n in temp: raise SemanticError('runtime graph cycle detected')
        if n in done: return
        temp.add(n)
        for d in graph[n]: visit(d)
        temp.remove(n); done.add(n)
    for n in graph: visit(n)
    return True
