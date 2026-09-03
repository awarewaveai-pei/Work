#!/usr/bin/env python3
# Local development server only: per-run in-memory X-Foundry-Token is a lightweight
# CSRF guard, not authentication -- there is no rate limiting and no TLS. Do not run
# with --host bound to a non-loopback address on a network you do not trust.
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
import argparse,json,secrets,mimetypes
from configurator_engine import ROOT,load,resolve
from foundry_generate import generate
TOKEN=secrets.token_urlsafe(24); OUTPUT_ROOT=None
class H(BaseHTTPRequestHandler):
    def sendj(self,obj,status=200):
        b=json.dumps(obj,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
    def do_GET(self):
        if self.path=='/api/catalog':return self.sendj({'catalog':load('questionnaires/catalog.json'),'baseline':load('baselines/production-baseline.json'),'token':TOKEN})
        p='index.html' if self.path=='/' else self.path.lstrip('/'); fp=(ROOT/'configurator'/p).resolve()
        if ROOT/'configurator' not in fp.parents and fp!=(ROOT/'configurator').resolve(): self.send_error(403);return
        if not fp.is_file(): self.send_error(404);return
        b=fp.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(fp.name)[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
    def do_POST(self):
        if self.headers.get('X-Foundry-Token')!=TOKEN:return self.sendj({'error':'invalid local session token'},403)
        if self.headers.get_content_type()!='application/json':return self.sendj({'error':'application/json required'},415)
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n>2_000_000: return self.sendj({'error':'request too large'},413)
            d=json.loads(self.rfile.read(n));plan=resolve(d['project'],d.get('answers',{}),d.get('custom_requirements',[]))
            if self.path=='/api/resolve':return self.sendj({'plan':plan})
            if self.path=='/api/generate':
                target=generate(plan,d.get('answers',{}),d.get('custom_requirements',[]),OUTPUT_ROOT);coverage=json.loads((target/'.foundry/verification/generation-coverage.json').read_text());return self.sendj({'path':str(target),'plan':plan,'coverage':coverage})
            return self.sendj({'error':'unknown endpoint'},404)
        except ValueError as e:return self.sendj({'errors':str(e).splitlines()},400)
        except FileExistsError as e:return self.sendj({'error':str(e)},409)
        except Exception as e:return self.sendj({'error':str(e)},500)
    def log_message(self,fmt,*args): print('[configurator]',fmt%args)
def main():
    global OUTPUT_ROOT
    ap=argparse.ArgumentParser();ap.add_argument('--host',default='127.0.0.1');ap.add_argument('--port',type=int,default=8765);ap.add_argument('--output-root',default=str(ROOT/'generated'));a=ap.parse_args();OUTPUT_ROOT=Path(a.output_root).resolve()
    if a.host not in ('127.0.0.1','localhost','::1'): print(f'WARNING: binding to non-loopback host {a.host!r}. This server has no rate limiting and no TLS; the CSRF token is a local-only convenience, not authentication. Only do this on a network you trust.')
    print(f'Open http://{a.host}:{a.port}');print('Output root:',OUTPUT_ROOT);ThreadingHTTPServer((a.host,a.port),H).serve_forever()
if __name__=='__main__':main()
