#!/usr/bin/env python3
from pathlib import Path
import argparse, hashlib, json, subprocess
ROOT=Path(__file__).resolve().parents[1]; VERSION='1.6.0'

class IntegrityError(Exception): pass

def sha(p):
    if not p.is_file(): raise IntegrityError(f"tracked file missing from disk (deleted but not `git rm`'d?): {p.relative_to(ROOT)}")
    return hashlib.sha256(p.read_bytes()).hexdigest()

# git-tracked files only, not a raw filesystem walk: this directory is a subtree of a shared
# monorepo where other concurrent sessions routinely leave untracked scratch/WIP files sitting
# around (observed live 2026-09-05: another session's untracked Ollama docs + a stray
# .agency-state/*.log got permanently baked into manifest.json's protected-file inventory the
# moment this script ran with --write while they existed in the tree). A raw `Path.rglob('*')`
# has no way to distinguish "this repo's committed content" from "whatever happens to be lying
# in the working tree right now" -- git ls-files is the actual definition of "this subtree's
# file inventory" a clean checkout / CI will have, so it's the only enumeration that can't be
# polluted by a neighbor's uncommitted mess, regardless of who runs --write or when.
#
# -z + core.quotePath=false + explicit utf-8: git's default `ls-files` C-quotes any non-ASCII
# path into an octal-escaped string (a CJK filename becomes literal text like "\346\274\242...")
# and subprocess's `text=True` would additionally decode that output with the platform locale
# codec (cp950 on this fleet, per agency-os/AGENTS.md's own recurring-encoding-trap warning) --
# either one alone is enough to turn a real CJK path into something sha(ROOT/f) can't open.
# `-z` NUL-separates entries so a path containing a literal newline also round-trips exactly.
def tracked_files(subdir=None):
    args=['git','-c','core.quotePath=false','ls-files','-z']+([subdir] if subdir else [])
    out=subprocess.run(args,cwd=ROOT,capture_output=True,check=True,encoding='utf-8').stdout
    # set(): git lists a path once per unmerged-conflict stage during a mid-merge state, so a
    # plain sorted() would silently double-count it in `files`/`file_count` while the
    # `file_hashes` dict (keyed by path) quietly deduped -- inconsistent inventory vs. hash map.
    return sorted(set(f for f in out.split('\0') if f))

def main():
    ap=argparse.ArgumentParser(description='Regenerate kernel and package integrity metadata after an approved Foundry change.'); ap.add_argument('--write',action='store_true'); a=ap.parse_args()
    # kernel/*.md, direct children only (matches the pre-existing flat layout and
    # tests/test_validate_foundry.py's own len(kernel/*.md) assumption) -- git ls-files kernel
    # is recursive, so filter to depth 1 explicitly rather than silently changing what counts as
    # a kernel file the day someone adds a kernel/ subdirectory.
    kfiles=sorted(f for f in tracked_files('kernel') if f.endswith('.md') and f.count('/')==1)
    items=[{'path':r,'sha256':sha(ROOT/r)} for r in kfiles]
    kd=hashlib.sha256(json.dumps(items,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if not a.write:
        print('dry-run kernel_digest='+kd); print('Use --write only after approved change + tests.'); return 0
    files=sorted(f for f in tracked_files() if Path(f).name!='manifest.json')
    # Hash every protected file BEFORE writing anything: if a tracked file is missing from disk
    # (deleted but not `git rm`'d) sha() now raises IntegrityError instead of a raw traceback, and
    # doing it here -- before kernel.yaml/agent-roles.yaml/manifest.json are touched -- means that
    # failure leaves nothing partially rewritten (a prior version computed manifest.json's hashes
    # last, so a crash there left kernel.yaml/agent-roles.yaml already updated to a kernel_digest
    # manifest.json didn't agree with -- a spurious drift report on the very next run).
    file_hashes={r:sha(ROOT/r) for r in files}
    kr={'version':VERSION,'mode':'non_overridable_monotonic','files':items,'kernel_digest':kd}
    # newline='\n' pinned everywhere below: Path.write_text() otherwise applies the
    # platform default newline translation (CRLF on Windows), which changes the raw
    # bytes sha() hashes on the very next run and made this tool non-idempotent
    # (observed: two consecutive `make verify` runs on Windows produced a spurious
    # "hash drift: registries/kernel.yaml / runtime/agent-roles.yaml" with zero real
    # content difference -- git diff --ignore-all-space confirmed).
    (ROOT/'registries/kernel.yaml').write_text(json.dumps(kr,indent=2)+'\n',encoding='utf-8',newline='\n')
    roles=json.loads((ROOT/'runtime/agent-roles.yaml').read_text(encoding='utf-8')); roles['inheritance']['kernel_digest']=kd; roles['inheritance']['kernel_version']=VERSION; (ROOT/'runtime/agent-roles.yaml').write_text(json.dumps(roles,indent=2)+'\n',encoding='utf-8',newline='\n')
    m=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8')); m['kernel_digest']=kd; m['files']=files; m['file_count']=len(files)+1; m['file_hashes']=file_hashes; (ROOT/'manifest.json').write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('integrity metadata regenerated')
    return 0
if __name__=='__main__':
    try: raise SystemExit(main())
    except IntegrityError as e: print('ERROR:',e); raise SystemExit(1)
