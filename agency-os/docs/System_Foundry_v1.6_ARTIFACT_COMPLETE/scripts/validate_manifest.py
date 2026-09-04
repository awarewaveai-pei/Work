#!/usr/bin/env python3
from pathlib import Path
import json, hashlib, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

# -z + core.quotePath=false + explicit utf-8: see regenerate_integrity.py's tracked_files() for
# why (git C-quotes non-ASCII paths, and subprocess text-mode decodes with the platform locale
# codec -- cp950 on this fleet -- either one alone corrupts a real CJK tracked path).
def git_ls(args):
    out=subprocess.run(['git','-c','core.quotePath=false']+args,cwd=ROOT,capture_output=True,check=True,encoding='utf-8').stdout
    return sorted(set(f for f in out.split('\0') if f))

def main():
    m=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    declared=m.get('files',[]); hashes=m.get('file_hashes',{})
    e=[]
    # Hash/presence check against the manifest's own declared file list -- this is the actual
    # supply-chain guarantee manifest.json exists for ("manifest_and_kernel_content_hashes" in
    # its own hard_guarantees), and it must work on ANY copy of this directory (the README's own
    # "reusable mother system" distribution story extracts this tree outside of any git
    # worktree), not only inside the git repo that happened to generate it. So this part never
    # touches git at all.
    for rel in declared:
        p=ROOT/rel
        if not p.is_file(): e.append('missing file: '+rel); continue
        if hashes.get(rel)!=sha(p): e.append('hash drift: '+rel)
    if set(hashes)!=set(declared): e.append('manifest hash inventory drift')
    if m.get('file_count')!=len(declared)+1: e.append('file_count drift')
    # Inventory-drift (declared vs. actually tracked) and undeclared-file detection DO need git,
    # since "what should be declared" is defined as "what git tracks" (see
    # regenerate_integrity.py). Degrade to a WARN instead of a hard FAIL when git is unavailable
    # (not installed, or this copy isn't a git checkout at all) -- the hash/presence check above
    # already proves the declared files are byte-identical to what was shipped, which is the
    # guarantee that has to keep working on a plain directory copy; the drift check is an extra
    # git-only cross-check available only inside a git worktree, not a strengthening of it.
    try:
        actual=sorted(f for f in git_ls(['ls-files','-z']) if Path(f).name!='manifest.json')
        if actual!=sorted(declared): e.append('file inventory drift')
        # Untracked files sitting inside this package (e.g. a neighbor session's uncommitted
        # scratch doc in a shared monorepo) are no longer silently baked into the protected-file
        # set (the Blocker this file used to have) -- but silently ignoring them entirely would
        # trade a false FAIL for a false sense of cleanliness, so surface them as an explicit
        # WARN. Not a FAIL: this subtree lives in a monorepo where other concurrent sessions
        # routinely have their own untracked WIP nearby, and failing the build on someone else's
        # in-progress file would just reintroduce the original false-failure problem from a
        # different angle.
        undeclared=git_ls(['ls-files','-z','--others','--exclude-standard'])
        if undeclared:
            print('WARN: untracked files present in package (not part of the integrity check; consider `git add` or removing):')
            for f in undeclared: print('  - '+f)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print('WARN: git unavailable in this copy -- skipped file-inventory-drift and undeclared-file checks (hash/presence check for declared files above still ran in full).')
    if e:
        print('MANIFEST VALIDATION: FAIL'); [print('- '+x) for x in e]; return 1
    print('MANIFEST VALIDATION: PASS'); return 0
if __name__=='__main__': sys.exit(main())
