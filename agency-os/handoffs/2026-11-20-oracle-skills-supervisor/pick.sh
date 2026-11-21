set -u
cd /d/Worktrees/Work/oracle-int
git fetch -q origin && git checkout -q --detach origin/main
for c in "$@"; do
  if git cherry-pick "$c" >/dev/null 2>&1; then echo "ok $c"; continue; fi
  files=$(git diff --name-only --diff-filter=U)
  echo "conflict@$c: $files"
  for f in $files; do
    python - "$f" <<'PY'
import pathlib,re,sys
f=sys.argv[1]; p=pathlib.Path(f); s=p.read_text(encoding="utf-8")
sep="\n" if f.endswith(".md") else ""
s2=re.sub(r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n", lambda m: m.group(1).rstrip("\n")+"\n"+sep+m.group(2), s, flags=re.S)
assert "<<<<<<<" not in s2
p.write_text(s2,encoding="utf-8",newline="\n")
PY
    git add -- "$f"
  done
  git -c core.editor=true cherry-pick --continue >/dev/null 2>&1 && echo "continued $c" || { echo "FAILED $c"; exit 1; }
done
git log --oneline -6
