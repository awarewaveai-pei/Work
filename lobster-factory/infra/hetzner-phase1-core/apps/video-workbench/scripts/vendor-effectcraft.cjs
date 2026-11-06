// EffectCraft web build (scripts/effectcraft-pro, with the ?host=parent bridge) -> engines/effectcraft/web/, checked against
// engines/effectcraft/VERSION.json. `node scripts/vendor-effectcraft.cjs [distDir]`; how it checks: scripts/vendor-craft.cjs.
// (Before card EC.2 this downloaded the official v0.20.0 release zip; that build has no bridge and is no longer used.)
require("./vendor-craft.cjs").run("effectcraft");
