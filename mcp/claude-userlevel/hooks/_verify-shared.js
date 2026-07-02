// MIGRATION SHIM (hooks v2): the real implementation moved to lib/shared.js.
// Legacy hook files require('./_verify-shared') until they are replaced by
// runner.js + rules/ (M3/M4). Delete this shim together with the legacy hooks.
module.exports = require('./lib/shared');
