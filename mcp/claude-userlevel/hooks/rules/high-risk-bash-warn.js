// Block high-risk production operations until operator ACK.
// Mechanizes AGENTS.md §操作風險分級 "High — STOP".
//
// Scans ctx.commandExpanded, so `bash -c "docker compose down"` string-wraps
// are visible (closes the legacy bypass — intended diff, locked in tests).
// The `cd x && docker compose down` single-line chain remains a documented
// pass (operator consciously typed the chain; gate targets standalone use).
// ACK: first non-blank line of the ORIGINAL command must be
//   # CONFIRMED-HIGH-RISK: <reason + rollback plan>
// ssh in LOCAL command position (line start or after a chain operator /
// then / do, past sudo/nohup/exec/command/time/timeout N), then a prod host.
const PROD_SSH_LINE_RE = /(?:^|&&|\|\||;|\||\(|\bthen\b|\bdo\b)\s*(?:(?:sudo|nohup|exec|command|time)\s+(?:-\S+\s+)*|timeout\s+(?:-\S+\s+)*\S+\s+)*ssh\b[^\n]*?(?:145\.239\.195\.47|ks-aw-01|5\.223\.93\.113|204\.168\.175\.41)/im;
const PROD_MUTATING_VERB_RE = /systemctl\s+(?:restart|stop)|docker[\s-]+compose\s+(?:down|stop|restart)|\breboot\b|\bshutdown\b/i;
const DEPLOY_SCRIPT_RE = /^(?:sg-deploy|rollback-phase1|auto-deploy-next-admin)(?:\.sh)?$/;
const SCHEDULED_TASK_MUTATION_RE = /\b(?:Register|Unregister|Start|Stop|Enable|Disable)-ScheduledTask\b|\bschtasks(?:\.exe)?\s+\/(?:create|run|delete|change)\b|\b(?:REGISTER_SYSTEM_GUARD_TASKS|realtest-reg)\.ps1\b/i;
// Words that run their operand as a command -> their options that take an argument.
const EXEC_WRAPPERS = {
  sudo: ['-u', '-g', '-C', '-h', '-p', '-r', '-t', '-U', '-D', '-R'],
  bash: ['-o', '-O'], sh: ['-o', '-O'], zsh: ['-o'], dash: ['-o'],
  exec: ['-a'], env: ['-u', '-C', '-S'], nohup: [], time: [], nice: ['-n'],
  timeout: ['-s', '-k'], source: [], '.': [], eval: [], command: [], builtin: [],
  setsid: [], stdbuf: ['-i', '-o', '-e'], ionice: ['-c', '-n', '-p'], runuser: ['-u', '-g', '-G'],
  xargs: ['-I', '-n', '-P', '-d', '-L', '-s', '-a', '-E'],
};
// Shell reserved words after which the next word is a command.
const SHELL_KEYWORDS = ['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!'];
// `su [opts] [user] -c CMD`: CMD is the only thing su runs.
const SU_CMD_OPTS = ['-c', '--command'];
// ssh options that can follow the host and take an argument.
const SSH_ARG_OPTS = ['-p', '-i', '-l', '-o', '-F', '-J', '-b', '-c', '-E', '-L', '-R', '-D', '-W', '-w', '-S', '-O', '-m', '-e', '-B', '-Q'];
const baseName = (tok) => tok.replace(/^.*\//, '');

const SHELLS = ['bash', 'sh', 'zsh', 'dash'];

// True when the remote command text runs a deploy script. Invariant: a script
// runs only from COMMAND POSITION -- the first word of a command (after
// ; && || | ( ) { } $( ` or line start, past if/then/do/... keywords,
// sudo/bash/su -c/exec/env/timeout/xargs/... wrappers, their options, VAR=val)
// -- or as stdin of a shell (`bash -s < sg-deploy.sh`, incl. ssh's own stdin
// when the remote command is a shell or absent). Any other position -- an
// argument to cat/tail/grep/cmp/stat, `cat < script`, a log path -- is a read.
// Quotes are dropped, so odd quoting over-matches (the safe direction).
function executesDeployScript(remote) {
  const flat = String(remote).replace(/["']/g, ' ');
  // Command lists (newline counts: a quoted remote command may span lines --
  // codex round 3), then pipelines inside each list. A shell later in a
  // pipeline executes whatever an earlier segment reads from a deploy script
  // (`cat < sg-deploy.sh | bash`, `cat sg-deploy.sh | sudo bash`), so a script
  // mentioned anywhere upstream in the same pipeline counts as that shell's
  // stdin (over-matches `grep x sg-deploy.sh | bash` -- the safe direction).
  return flat.split(/&&|\|\||;|\n|\$\(|`|[(){}]/).some((list, listIdx) =>
    list.split('|').reduce(({ hit, upstream }, seg, segIdx) => {
      if (hit) return { hit, upstream };
      const toks = seg.trim().split(/\s+/).filter(Boolean);
      // Pull `< target` / `<target` redirects out (not << heredoc / <( ).
      const stdin = [];
      for (let j = toks.length - 1; j >= 0; j--) {
        if (!/^\d*<(?![<(&])/.test(toks[j])) continue;
        const inline = toks[j].replace(/^\d*</, '');
        stdin.push(inline || toks[j + 1] || '');
        toks.splice(j, inline ? 1 : 2);
      }
      const mentions = upstream || [...stdin, ...toks].some((s) => DEPLOY_SCRIPT_RE.test(baseName(s)));
      const stdinIsScript = upstream || stdin.some((s) => DEPLOY_SCRIPT_RE.test(baseName(s)));
      let i = 0;
      if (listIdx === 0 && segIdx === 0) { // ssh options between host and remote command
        while (i < toks.length && toks[i].startsWith('-')) i += SSH_ARG_OPTS.includes(toks[i]) ? 2 : 1;
      }
      let argOpts = [];
      let sawShell = false;
      let verdict = null;
      while (i < toks.length && verdict === null) {
        const t = toks[i];
        const w = baseName(t);
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) || SHELL_KEYWORDS.includes(t)) i += 1;
        else if (t.startsWith('-')) {
          // A shell's -c with the command attached (`bash -cCMD`): real bash rejects it
          // ("-/: invalid option", verified 2026-09-23), but treat the attachment as the
          // command word anyway -- over-matching is the safe direction (codex round 4).
          const attached = sawShell ? /^-[A-Za-z]*c(.+)$/.exec(t) : null;
          if (attached && DEPLOY_SCRIPT_RE.test(baseName(attached[1].split(/\s+/)[0]))) verdict = true;
          else i += argOpts.includes(t) ? 2 : 1;
        }
        else if (w === 'su') {
          const c = toks.findIndex((x, j) => j > i && SU_CMD_OPTS.includes(x));
          if (c < 0) verdict = false;
          else { argOpts = []; i = c + 1; }
        }
        else if (Object.prototype.hasOwnProperty.call(EXEC_WRAPPERS, w)) {
          argOpts = EXEC_WRAPPERS[w]; sawShell = sawShell || SHELLS.includes(w); i += 1;
        }
        else if (argOpts === EXEC_WRAPPERS.timeout && /^\d+(?:\.\d+)?[smhd]?$/.test(t)) i += 1;
        else verdict = DEPLOY_SCRIPT_RE.test(w) || (sawShell && stdinIsScript);
      }
      // no command word left: a shell (or ssh's login shell) reads stdin
      if (verdict === null) verdict = stdinIsScript;
      return { hit: verdict, upstream: mentions };
    }, { hit: false, upstream: false }).hit);
}

const HIGH_RISK_PATTERNS = [
  {
    re: SCHEDULED_TASK_MUTATION_RE,
    label: 'scheduled-task mutation or SystemGuard registrar — may create hidden privileged persistence; operator ACK required',
  },
  {
    re: /^\s*(?:sudo\s+)?docker[\s-]+compose\s+(?:down|stop\b|rm\b)/im,
    label: 'docker compose down/stop/rm — takes production services offline',
  },
  {
    re: /^\s*(?:sudo\s+)?(?:rsync|scp)\b[^\n#'"]*(?:5\.223\.93\.113|204\.168\.175\.41)/im,
    label: 'direct VPS file transfer to production IP — use sg-deploy.sh instead',
  },
  {
    re: /^\s*(?:sudo\s+)?(?:(?:prisma|knex|sequelize|typeorm|drizzle-kit)\s+migrate\s+(?:deploy|run|latest)|npm\s+run\s+(?:db:)?migrate(?:\s|$))/im,
    label: 'database migration deploy — potentially irreversible schema change',
  },
  {
    // Deploy-flow mechanization (2026-07-02, Phase 4): ssh to a production host
    // that EXECUTES a deploy script or runs a restart/shutdown verb. Read-only
    // ssh passes: the script names count only in command position
    // (executesDeployScript) -- a substring match blocked `tail
    // sg-deploy-drift.log` / `grep .. auto-deploy-next-admin.sh` (2026-09-23).
    // The restart/shutdown verbs are still substring matches after the host.
    // Retired IPs kept in PROD_SSH_LINE_RE (unreachable, harmless).
    test: (text) => {
      // Whole text, every prod-ssh occurrence: the remote command runs to the
      // end of the text (a quoted remote command may span lines; anything
      // after it is over-matched, the safe direction). Was per-line.
      const re = new RegExp(PROD_SSH_LINE_RE.source, 'gim');
      let host;
      while ((host = re.exec(text)) !== null) {
        const remote = text.slice(host.index + host[0].length);
        if (PROD_MUTATING_VERB_RE.test(remote) || executesDeployScript(remote)) return true;
      }
      return false;
    },
    label: 'remote deploy/restart on production VPS — deploy flow first: /check-drift → /verify → tsc (if .ts changed) → operator go-ahead (AGENTS.md §部署流程觸發)',
  },
];

function isLeadingAck(cmd) {
  const firstNonBlank = cmd.split('\n').find((l) => l.trim().length > 0) || '';
  return /^\s*#\s*CONFIRMED-HIGH-RISK\s*:/.test(firstNonBlank);
}

module.exports = {
  check(ctx) {
    if (!ctx.command) return null;
    if (isLeadingAck(ctx.command)) return null;

    const matched = HIGH_RISK_PATTERNS.filter((p) => (p.test ? p.test(ctx.commandExpanded) : p.re.test(ctx.commandExpanded)));
    if (!matched.length) return null;

    return {
      block: [
        '[Hook] HIGH-RISK OPERATION BLOCKED — operator ACK required:',
        ...matched.map((m) => `[Hook]   ⚠  ${m.label}`),
        '[Hook] To proceed: re-issue with a LEADING comment on its own first line:',
        '[Hook]   # CONFIRMED-HIGH-RISK: <reason + rollback plan>',
        '[Hook]   <original command>',
      ],
    };
  },
};
