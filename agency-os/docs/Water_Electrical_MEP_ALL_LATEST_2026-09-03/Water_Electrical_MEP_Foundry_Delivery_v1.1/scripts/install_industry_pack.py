#!/usr/bin/env python3
from pathlib import Path
import argparse,shutil,sys
ROOT=Path(__file__).resolve().parents[1]; SRC=ROOT/'foundry-overlay/industry-packs/construction-mep-contractor'
ap=argparse.ArgumentParser(); ap.add_argument('--foundry-root',required=True); a=ap.parse_args(); fr=Path(a.foundry_root).resolve(); dest=fr/'industry-packs/construction-mep-contractor'
if not (fr/'README.md').exists(): raise SystemExit('target does not look like a System Foundry root: '+str(fr))
if dest.exists(): raise SystemExit('refuse overwrite: '+str(dest))
dest.parent.mkdir(parents=True,exist_ok=True); shutil.copytree(SRC,dest); print(dest)
