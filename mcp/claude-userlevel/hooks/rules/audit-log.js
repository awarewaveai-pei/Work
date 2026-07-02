// Audit-log all bash commands with secret auto-redaction. Verbatim port.
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = {
  check(ctx) {
    const cmd = String(ctx.command || '?')
      .replace(/\n/g, ' ')
      .replace(/--token[= ][^ ]*/g, '--token=<REDACTED>')
      .replace(/password[= ][^ ]*/gi, 'password=<REDACTED>')
      .replace(/\bghp_[A-Za-z0-9_]+\b/g, '<REDACTED>')
      .replace(/\bgho_[A-Za-z0-9_]+\b/g, '<REDACTED>')
      .replace(/sshpass\s+-p\s+'[^']*'/g, "sshpass -p '<REDACTED>'")
      .replace(/AIza[a-zA-Z0-9_-]{35}/g, '<REDACTED>');
    const logDir = path.join(os.homedir(), '.claude');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'bash-commands.log'), `[${new Date().toISOString()}] ${cmd}\n`);
    return null;
  },
};
