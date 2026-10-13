"""Build the rig's nginx.conf from prod's own file: the cognitive limit zones and the `server_name cognitive.aware-wave.com` block are
copied verbatim from lobster-factory/infra/hetzner-phase1-core/nginx/default.conf, so the rig exercises the real per-person limits.
Only the wrapper differs: the loadgen network is trusted for CF-Connecting-IP (the rig's way to give each class its own address) and
every other prod server block is left out.

    python make_nginx_conf.py <path to default.conf> > nginx.rig.conf
"""
import re
import sys

source = open(sys.argv[1], encoding="utf-8").read()
zones = [line for line in source.splitlines()
         if line.startswith("map $cookie_cognitive_os_session") or re.match(r"limit_req_zone .*zone=cognitive(_ip|_login)?:", line) or line.startswith("limit_req_status")]
if len(zones) != 5:
    raise SystemExit(f"expected the 3 cognitive zones, the cookie map and limit_req_status in {sys.argv[1]}, found {zones}")

upstreams = []
for name in ("cognitive_api", "cognitive_web"):
    at = source.index("upstream " + name + " {")
    upstreams.append(source[at:source.index("\n}\n", at) + 3])

marker = source.index("server_name cognitive.aware-wave.com;")
start = source.rindex("\nserver {", 0, marker) + 1
depth, end = 0, start
for end in range(start, len(source)):
    depth += {"{": 1, "}": -1}.get(source[end], 0)
    if depth == 0 and source[end] == "}":
        break
block = source[start:end + 1]

print("worker_processes auto;   # as lobster-nginx (nginx -T on ks-aw-01: auto, worker_connections 1024)")
print("events { worker_connections 1024; }")
print("http {")
print("    include /etc/nginx/mime.types;")
print("    log_format main '$remote_addr real=$realip_remote_addr [$time_local] \"$request\" $status $body_bytes_sent rt=$request_time urt=$upstream_response_time';")
print("    access_log /var/log/nginx/access.log main;")
print("    keepalive_timeout 65;")
print("    set_real_ip_from 172.16.0.0/12;   # the rig network (docker's default pools); prod trusts Cloudflare + the host nginx here")
print("    set_real_ip_from 192.168.0.0/16;")
print("    real_ip_header CF-Connecting-IP;")
print("    geo $realip_remote_addr $is_trusted_source { default 0; 172.16.0.0/12 1; 192.168.0.0/16 1; 127.0.0.1/32 1; }")
for line in zones:
    print("    " + line)
print()
for upstream in upstreams:
    print("\n".join("    " + line if line else line for line in upstream.splitlines()))
print()
print("\n".join("    " + line if line else line for line in block.splitlines()))
print("}")
