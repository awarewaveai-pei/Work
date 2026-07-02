// Block modifications to linter/formatter config files — fix the source
// instead of weakening the config. File list preserved verbatim.
const path = require('path');

const PROTECTED = new Set([
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts',
  '.prettierrc', '.prettierrc.js', '.prettierrc.json',
  'prettier.config.js', 'prettier.config.mjs',
  'biome.json', 'biome.jsonc',
  '.ruff.toml', 'ruff.toml',
  '.stylelintrc', '.stylelintrc.json',
]);

module.exports = {
  check(ctx) {
    for (const f of ctx.files) {
      const bn = path.basename(f);
      if (PROTECTED.has(bn)) {
        return { block: [`[Hook] BLOCKED: Modifying ${bn} is not allowed. Fix the source code instead of weakening linter/formatter config.`] };
      }
    }
    return null;
  },
};
