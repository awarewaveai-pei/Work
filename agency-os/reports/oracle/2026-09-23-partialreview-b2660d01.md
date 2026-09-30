# codex-oracle review -- 2026-09-23 23:18:22 +08:00

- mode: `review`
- scope: -Path mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, tests/hooks/runner-parity.test.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ROUND 5 (landing) of high-risk-bash-warn rule 4. Round-4 finding (compact autocd         	off
assoc_expand_once	off
cdable_vars    	off
cdspell        	off
checkhash      	off
checkjobs      	off
checkwinsize   	on
cmdhist        	on
compat31       	off
compat32       	off
compat40       	off
compat41       	off
compat42       	off
compat43       	off
compat44       	off
completion_strip_exe	off
complete_fullquote	on
direxpand      	off
dirspell       	off
dotglob        	off
execfail       	off
expand_aliases 	off
extdebug       	off
extglob        	off
extquote       	on
failglob       	off
force_fignore  	on
globasciiranges	on
globskipdots   	on
globstar       	off
gnu_errfmt     	off
histappend     	off
histreedit     	off
histverify     	off
hostcomplete   	on
huponexit      	off
inherit_errexit	off
interactive_comments	on
lastpipe       	off
lithist        	off
localvar_inherit	off
localvar_unset 	off
login_shell    	off
mailwarn       	off
no_empty_cmd_completion	off
nocaseglob     	off
nocasematch    	off
noexpand_translation	off
nullglob       	off
patsub_replacement	on
progcomp       	on
progcomp_alias 	off
promptvars     	on
restricted_shell	off
shift_verbose  	off
sourcepath     	on
varredir_close 	off
xpg_echo       	off) verified NOT executable by real bash ( -> , exit 2) but handled anyway in the safe direction: for a shell wrapper, an option token matching /^-[A-Za-z]*c(.+)$/ whose attachment names a deploy script counts as executing (new P4-1d case, exit 2). Also in this diff: the charter parity test now passes its own session_id (subagent-budget keys its 20-minute Agent window on the sid; without one every suite run shared no-sid and the 11th run in 20 minutes was blocked). Suite 161/161; mutations: drop the newline list separator -> multi-line case red; ignore upstream pipeline script -> 2 pipe cases red; scan only the first ssh -> second-ssh-line case red. Please confirm nothing else regressed and report only supportable findings.
- exit: 0 | elapsed: 312796ms | answer: 750B
- files-reviewed: mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js, tests/hooks/runner-parity.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Read-only pipelines containing a deploy script are falsely blocked  
  mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:49 -> mcp/claude-userlevel/hooks/rules/high-risk-bash-warn.js:83  
  confidence  -> CONFIRMED  
  scenario    -> `ssh ks-aw-01 'cat /root/lobster-phase1/scripts/sg-deploy.sh | wc -l'` marks the first segment as `upstream`, propagates that state to `wc`, and returns `true` even though no shell executes the script -> the safety hook blocks a read-only diagnostic (exit 2 instead of 0).  
  why missed  -> The pipeline logic treats any downstream command as a shell consumer; the listed read-only pipeline test does not match the implementation’s propagated `stdinIsScript` state.

Final line: TOTAL: 1 findings
