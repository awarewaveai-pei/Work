#!/usr/bin/env bash
# check-ci-green.sh -- read-only: for the apps about to be deployed, GitHub Actions already ran their deploy gates
# on this commit's files and they are green.
#
# Why: sg-deploy.sh runs the same gates itself, but minutes into a deploy. On 2026-11-20 four deploys failed there;
# one of them an hour after CI had gone red on the same test. Asking CI first turns that into a refusal in seconds.
# Not a second hard stop: sg-deploy.sh's own gates still run after this one.
#
# Rule, per workflow in app_workflows below: take its newest run on main whose commit is <commit> or an ancestor
# of it. (Not "the run for <commit>": a workflow with a path filter has no run for a commit that touched none of its
# paths, and its last run still speaks for those files.) That run must be completed with conclusion success.
# The run speaks for <commit> only while the files in the workflow's own `on.push.paths` are the same in both; when
# they differ, a push GitHub has not listed a run for yet came after it (red main, fix pushed, deploy at once), and
# that run is waited for like one still going: up to CI_GATE_WAIT_SECONDS (default 900), asked every
# CI_GATE_POLL_SECONDS (60).
#
# Usage: check-ci-green.sh <repo_dir> <commit> <app>...
# Exit 0 = green, or no workflow gates these apps. Exit 1 = a run is red, was cancelled (a newer push replaced it:
# pull and deploy that), is still going after the wait, or no run covers this commit -- each listed with its URL.
# Exit 2 = could not ask (curl or node missing, origin unreadable or not on GitHub, GitHub unreachable or rate-limited).

set -euo pipefail
REPO_DIR="${1:?usage: check-ci-green.sh <repo_dir> <commit> <app>...}"
COMMIT="${2:?usage: check-ci-green.sh <repo_dir> <commit> <app>...}"
shift 2
WAIT="${CI_GATE_WAIT_SECONDS:-900}"
POLL="${CI_GATE_POLL_SECONDS:-60}"
API="${CI_GATE_API:-https://api.github.com}"

# The one place that says which workflows run an app's deploy gates.
app_workflows() {
  case "$1" in
    next-admin)      echo "next-admin-typecheck.yml next-admin-test.yml" ;;
    video-workbench) echo "video-workbench-ci.yml" ;;
    oracle-web)      echo "oracle-web-ci.yml" ;;
  esac
}

workflows=()
for app in "$@"; do
  for wf in $(app_workflows "$app"); do
    [[ " ${workflows[*]:-} " == *" $wf "* ]] || workflows+=("$wf")
  done
done
if [[ ${#workflows[@]} -eq 0 ]]; then echo "ci-gate: OK -- no CI workflow gates: $*"; exit 0; fi

command -v curl >/dev/null && command -v node >/dev/null || { echo "ci-gate: curl or node missing" >&2; exit 2; }
git -C "$REPO_DIR" cat-file -e "${COMMIT}^{commit}" 2>/dev/null || { echo "ci-gate: $COMMIT is not a commit in $REPO_DIR" >&2; exit 2; }
# owner/repo = the last two parts of origin, whatever the host part is: the deploy host's origin is an ssh alias
# (git@github.com-work:owner/repo.git). A repository GitHub does not know answers 404 below, which is exit 2.
slug="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null | sed -nE 's#^.*[:/]([^/:]+/[^/:]+)$#\1#p' | sed 's#\.git$##')"
[[ -n "$slug" ]] || { echo "ci-gate: cannot read owner/repo from origin of $REPO_DIR" >&2; exit 2; }

# Prints "state<TAB>url" for one workflow: state = success | running | red:<conclusion> | none.
verdict() {
  local wf="$1" body runs status conclusion sha url wf_text
  local -a paths=()
  # The workflow's push paths at <commit>, as git glob pathspecs; none listed = every push runs it = the whole tree.
  wf_text="$(git -C "$REPO_DIR" show "$COMMIT:.github/workflows/$wf" 2>/dev/null)" || { printf 'none\t-\n'; return 0; }
  mapfile -t paths < <(node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const push = (s.match(/^  push:\n([\s\S]*?)(?=^  \S|^\S)/m) || [, ""])[1];
      const list = (push.match(/^    paths:\n((?:^      .*\n|^\s*\n)*)/m) || [, ""])[1];
      for (const m of list.matchAll(/^      - \x27([^\x27]+)\x27\s*$/gm)) console.log(":(glob)" + m[1]);
    });' <<<"$wf_text")
  body="$(curl -sS -m 20 -H "Accept: application/vnd.github+json" "$API/repos/$slug/actions/workflows/$wf/runs?branch=main&per_page=30")" \
    || { echo "ci-gate: cannot reach GitHub for $wf" >&2; return 2; }
  runs="$(node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let j; try { j = JSON.parse(s); } catch { j = {}; }
      if (!Array.isArray(j.workflow_runs)) { console.error(String(j.message || "not a run list").slice(0, 200)); process.exit(1); }
      for (const r of j.workflow_runs) console.log([r.status, r.conclusion || "-", r.head_sha, r.html_url].join("\t"));
    });' <<<"$body" 2>&1)" || { echo "ci-gate: GitHub did not list runs of $wf: $runs" >&2; return 2; }
  while IFS=$'\t' read -r status conclusion sha url; do
    [[ -n "$sha" ]] || continue
    git -C "$REPO_DIR" merge-base --is-ancestor "$sha" "$COMMIT" 2>/dev/null || continue
    if ! git -C "$REPO_DIR" diff --quiet "$sha" "$COMMIT" -- "${paths[@]}"; then printf 'running\t%s\n' "no run listed yet for ${COMMIT:0:9}; newest is $url"
    elif [[ "$status" != "completed" ]]; then printf 'running\t%s\n' "$url"
    elif [[ "$conclusion" == "success" ]]; then printf 'success\t%s\n' "$url"
    else printf 'red:%s\t%s\n' "$conclusion" "$url"; fi
    return 0
  done <<<"$runs"
  printf 'none\t-\n'
}

deadline=$(( $(date +%s) + WAIT ))
pending=("${workflows[@]}")
problems=()
while :; do
  still=()
  for wf in "${pending[@]}"; do
    out="$(verdict "$wf")" || exit 2
    state="${out%%$'\t'*}"; url="${out#*$'\t'}"
    case "$state" in
      success) echo "ci-gate: $wf green ($url)" ;;
      running) still+=("$wf"$'\t'"$url") ;;
      red:cancelled) problems+=("$wf: the run for this commit was cancelled, a newer push replaced it -- pull and deploy that ($url)") ;;
      red:*)   problems+=("$wf: ${state#red:} ($url)") ;;
      none)    problems+=("$wf: no run on main covers ${COMMIT:0:9}") ;;
    esac
  done
  if [[ ${#problems[@]} -gt 0 || ${#still[@]} -eq 0 ]]; then break; fi
  if [[ $(date +%s) -ge $deadline ]]; then
    for s in "${still[@]}"; do problems+=("${s%%$'\t'*}: still running after ${WAIT}s (${s#*$'\t'})"); done
    break
  fi
  echo "ci-gate: waiting for $(printf '%s ' "${still[@]%%$'\t'*}")(asks again in ${POLL}s)"
  pending=("${still[@]%%$'\t'*}")
  sleep "$POLL"
done

if [[ ${#problems[@]} -gt 0 ]]; then
  echo "ci-gate: CI is not green for ${COMMIT:0:9}:"
  printf '  %s\n' "${problems[@]}"
  exit 1
fi
echo "ci-gate: OK -- ${#workflows[@]} workflow(s) green for ${COMMIT:0:9}"
