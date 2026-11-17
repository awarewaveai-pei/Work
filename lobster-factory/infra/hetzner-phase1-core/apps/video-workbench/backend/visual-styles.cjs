const path = require("node:path");
const source = require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env);
const catalog = require(path.join(source, "public/editor-shared/video-styles.js"));
module.exports = { catalog: catalog.VIDEO_STYLE_CATALOG.map(s => ({ ...s, prompt: catalog.resolveVideoStyle(s.id) })) };
