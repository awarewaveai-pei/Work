#!/usr/bin/env python3
from pathlib import Path
import argparse,json
from configurator_engine import resolve

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('input'); ap.add_argument('--out'); a=ap.parse_args(); d=json.loads(Path(a.input).read_text(encoding='utf-8')); p=resolve(d['project'],d['answers'],d.get('custom_requirements',[])); text=json.dumps(p,ensure_ascii=False,indent=2)+'\n'; Path(a.out).write_text(text,encoding='utf-8') if a.out else print(text,end='')
if __name__=='__main__': main()
