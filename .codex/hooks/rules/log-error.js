// Record tool errors to ~/.claude/error-log.md for post-mortem. JS port of
// log-error.sh (drops the bash+jq dependency; mkdirs the target directory —
// the shell version silently failed on a fresh HOME, locked in tests).
const fs = require('fs');
const os = require('os');
const path = require('path');

const ERROR_RE = /error|failed|ENOENT|EACCES|permission denied|not found|fatal|exception|traceback/i;

module.exports = {
  check(ctx) {
    const out = typeof ctx.payload.tool_output === 'string'
      ? ctx.payload.tool_output
      : JSON.stringify(ctx.payload.tool_output || '');
    if (!ERROR_RE.test(out)) return null;

    const dir = path.join(os.homedir(), '.claude');
    fs.mkdirSync(dir, { recursive: true });
    const logFile = path.join(dir, 'error-log.md');
    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, '# Claude Code Error Log\n\n');
    }
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const toolInput = JSON.stringify(ctx.toolInput).slice(0, 300);
    const snippet = out.slice(0, 500);
    fs.appendFileSync(logFile,
      `\n## ${ts} - ${ctx.toolName || 'Unknown'}\n\n**Input:**\n\`\`\`\n${toolInput}\n\`\`\`\n\n**Error:**\n\`\`\`\n${snippet}\n\`\`\`\n\n**Solution:** (fill in after fix)\n\n---\n`);
    return null;
  },
};
