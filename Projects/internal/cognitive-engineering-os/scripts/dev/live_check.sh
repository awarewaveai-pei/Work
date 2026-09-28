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
check /api/catalog                             200 '"tools":284'
nc=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B/methods")
echo "no cookie /methods -> $nc"; [[ "$nc" == 307* && "$nc" == *"/login"* ]] || { echo "FAIL no-cookie redirect"; fail=1; }
na=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/projects/x/analyses")
echo "no session /api/projects/x/analyses -> $na"; [[ "$na" == 401 ]] || { echo "FAIL analyses without a session"; fail=1; }
exit $fail
