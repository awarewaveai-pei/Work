#!/usr/bin/env bash
# Live site after the deploy: every page status + one marker from the new version. The web middleware only checks that
# a session cookie is present (pages that need the user's data fetch it in the browser), so a placeholder cookie is
# enough to render the server pages; no login, no credentials.
B=https://cognitive.aware-wave.com
C='cognitive_os_session=placeholder'
fail=0
check() {   # path, expected status, marker ('' = none)
  local body status
  body=$(curl -s -o - -w '\n%{http_code}' -H "Cookie: $C" "$B$1")
  status=${body##*$'\n'}; body=${body%$'\n'*}
  if [[ "$status" != "$2" ]] || { [[ -n "$3" ]] && ! grep -qF -- "$3" <<<"$body"; }; then echo "FAIL $1 -> $status (want $2, marker '$3')"; fail=1
  else echo "ok   $1 -> $status${3:+ [$3]}"; fi
}
check /                                        200 '把一件事想清楚'
check /methods                                 200 '知道名字就直接搜'
check /methods/systems.iceberg_model           200 '第一次用？先上 5 分鐘的課 ↗'
check /methods/systems.iceberg_model/run       200 ''
check /learn/systems.iceberg_model             200 '開始：填你自己的案例'
check /learn/workflow/life-decision-v1         200 '開始：走你自己的決定'
check /learn/strategy.swot                     404 ''
check /workflows                               200 '第一次走？先上 3 分鐘的課 ↗'
check /projects                                200 ''
check /api/health                              200 '"status":"ok"'
check /projects/x                              200 ''
check /projects/x/analyses/INTERP-X            200 ''
check '/methods/systems.iceberg_model/run?project=x' 200 ''
check /api/catalog                             200 '"counts":'
# Catalog counts must equal what this checkout's registry yields (run from the deployed commit); a literal count here
# went stale the first time a tool was added (2026-10-03: live 286, script still wanted 284).
here=$(cd "$(dirname "$0")/../.." && pwd) || { echo "FAIL resolve product root"; exit 1; }
want=$(cd "$here" && env -u AI_LEGO_SPEC_ROOT python -c 'import json; from ai_lego.platform.catalog.display_catalog import catalog_payload, load_catalog; print(json.dumps(catalog_payload(load_catalog())["counts"], sort_keys=True))') || { echo "FAIL local catalog counts"; fail=1; }
got=$(curl -s "$B/api/catalog" | python -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["counts"], sort_keys=True))') || got='unreadable'
if [[ -n "$want" && "$want" == "$got" ]]; then echo "ok   catalog counts $got (= checkout $(git -C "$here" describe --always --dirty))"
else echo "FAIL catalog counts live=$got checkout=$want"; fail=1; fi
nc=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B/methods")
echo "no cookie /methods -> $nc"; [[ "$nc" == 307* && "$nc" == *"/login"* ]] || { echo "FAIL no-cookie redirect"; fail=1; }
na=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/projects/x/analyses")
echo "no session /api/projects/x/analyses -> $na"; [[ "$na" == 401 ]] || { echo "FAIL analyses without a session"; fail=1; }
exit $fail
