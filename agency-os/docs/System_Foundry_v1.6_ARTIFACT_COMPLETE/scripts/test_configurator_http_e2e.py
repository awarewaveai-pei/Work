#!/usr/bin/env python3
from pathlib import Path
import sys,tempfile,subprocess,socket,time,json,urllib.request
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
import test_selection_matrix as matrix

def free_port():
    s=socket.socket(); s.bind(('127.0.0.1',0)); p=s.getsockname()[1]; s.close(); return p

def main():
    with tempfile.TemporaryDirectory() as td:
        port=free_port(); proc=subprocess.Popen([sys.executable,str(ROOT/'scripts/serve_configurator.py'),'--host','127.0.0.1','--port',str(port),'--output-root',td],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
        try:
            base=f'http://127.0.0.1:{port}'
            catalog=None
            for _ in range(50):
                try:
                    with urllib.request.urlopen(base+'/api/catalog',timeout=1) as r: catalog=json.load(r); break
                except Exception: time.sleep(.1)
            if not catalog: raise RuntimeError('server did not start')
            token=catalog['token']
            answers=matrix.complete({'Q-CH-001':True,'Q-ID-001':True,'Q-ORG-001':True,'Q-AI-007':True},False)
            payload=json.dumps({'project':{'name':'http-e2e'},'answers':answers,'custom_requirements':[{'category':'custom','statement':'保留特殊客製流程'}]},ensure_ascii=False).encode()
            req=urllib.request.Request(base+'/api/generate',data=payload,method='POST',headers={'Content-Type':'application/json','X-Foundry-Token':token})
            with urllib.request.urlopen(req,timeout=30) as r: result=json.load(r)
            out=Path(result['path'])
            if result['coverage']['blueprints_total']!=73: raise RuntimeError('HTTP generation blueprint coverage invalid')
            for rel in ['docs/modules/web/MODULE_MANIFEST.json','docs/modules/identity/MODULE_MANIFEST.json','docs/modules/tenant/MODULE_MANIFEST.json','docs/modules/ai/MODULE_MANIFEST.json','docs/modules/custom/MODULE_MANIFEST.json','.foundry/resolution/artifact-manifest.json']:
                if not (out/rel).is_file(): raise RuntimeError('HTTP generation missing '+rel)
            print('CONFIGURATOR HTTP E2E: PASS')
            return 0
        finally:
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill()
if __name__=='__main__': raise SystemExit(main())
