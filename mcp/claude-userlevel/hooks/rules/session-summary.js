// Stop: append a session summary to ~/.claude/sessions/<date>-<sid>.md.
// SID now comes from the unified derivation (ctx.sid).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = {
  check(ctx) {
    const sessionsDir = path.join(os.homedir(), '.claude', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(sessionsDir, `${today}-${ctx.sid}.md`);

    let gitStatus = '';
    let gitLog = '';
    try {
      gitStatus = (spawnSync('git', ['status', '--short'], { encoding: 'utf8', timeout: 3000 }).stdout || '').trim();
    } catch (_) { /* not a repo */ }
    try {
      gitLog = (spawnSync('git', ['log', '--oneline', '-10'], { encoding: 'utf8', timeout: 3000 }).stdout || '').trim();
    } catch (_) { /* not a repo */ }

    const exists = fs.existsSync(file);
    let content = '';
    if (!exists) {
      content += `# Session ${today} ${ctx.sid}\n\n**CWD**: \`${ctx.cwd}\`\n\n`;
    }
    content += `## ${new Date().toISOString().slice(11, 19)}\n\n`;
    if (gitStatus) content += `**Working tree**:\n\`\`\`\n${gitStatus}\n\`\`\`\n\n`;
    if (gitLog && !exists) content += `**Recent commits**:\n\`\`\`\n${gitLog}\n\`\`\`\n\n`;
    content += '---\n\n';
    fs.appendFileSync(file, content);
    return null;
  },
};
