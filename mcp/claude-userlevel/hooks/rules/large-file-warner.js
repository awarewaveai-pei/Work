// Warn at 500KB, block at 2MB on Read without offset/limit. Verbatim port.
const fs = require('fs');

const WARN_BYTES = 500 * 1024;
const BLOCK_BYTES = 2 * 1024 * 1024;

module.exports = {
  check(ctx) {
    const fp = ctx.toolInput.file_path;
    if (!fp) return null;
    if (ctx.toolInput.offset != null || ctx.toolInput.limit != null) return null;

    let stat;
    try { stat = fs.statSync(fp); } catch (_) { return null; }
    if (!stat.isFile()) return null;

    if (stat.size >= BLOCK_BYTES) {
      return {
        block: [
          `[Hook] BLOCKED: ${fp} is ${(stat.size / 1024 / 1024).toFixed(1)} MB. ` +
          'Reading the whole file would burn context. ' +
          'Use Read with offset/limit, or Grep to find the relevant section first.',
        ],
      };
    }
    if (stat.size >= WARN_BYTES) {
      return {
        warn: [
          `[Hook] WARNING: ${fp} is ${(stat.size / 1024).toFixed(0)} KB. ` +
          'Consider using offset/limit if you only need a portion.',
        ],
      };
    }
    return null;
  },
};
