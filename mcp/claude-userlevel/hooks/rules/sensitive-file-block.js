// Block writes to sensitive files (.env / .pem / .key, /secrets/ dirs,
// credentials paths). Replaces the hooks.json inline blocker whose jq read
// `.file_path` at top level and never fired (intended diff, locked in tests).
// Pattern preserved verbatim from the inline (case-sensitive on purpose:
// repo-tracked CREDENTIALS.md docs stay editable).
const SENSITIVE = /\.(env|pem|key)$|\/secrets\/|credentials/;

module.exports = {
  check(ctx) {
    for (const f of ctx.files) {
      const norm = String(f).replace(/\\/g, '/');
      if (SENSITIVE.test(norm)) {
        return { block: [`[Hook] BLOCKED: Cannot modify sensitive file: ${f}`] };
      }
    }
    return null;
  },
};
