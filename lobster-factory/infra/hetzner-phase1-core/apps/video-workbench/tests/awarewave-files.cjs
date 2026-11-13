// P6 L3: awarewave-files.txt is the one list of next-admin files this server reads (package + container .awarewave/).
// Fails when a backend/server read of a next-admin file, or a runtime relative import inside a listed .ts file, is
// missing from the list, or a listed file does not exist (a container without it would break only at that call).
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const root = path.join(__dirname, ".."),
  { runtimeFiles, resolveSource } = require("../backend/appearance.cjs"),
  appDir = resolveSource(root, process.env),
  listed = new Set(runtimeFiles(root)),
  { dependencies = {} } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const sources = ["server.cjs", ...fs.readdirSync(path.join(root, "backend")).filter((f) => f.endsWith(".cjs")).map((f) => "backend/" + f)];
let reads = 0;
for (const name of sources) {
  const text = fs.readFileSync(path.join(root, name), "utf8");
  for (const [, file] of text.matchAll(/"((?:lib|app|public)\/[\w/.-]+\.(?:ts|css))"/g)) {
    reads++;
    assert.ok(listed.has(file), `${name} reads ${file}; add it to awarewave-files.txt`);
  }
}
assert.ok(reads >= 8, "expected the known runtime reads, found " + reads);

for (const file of listed) {
  assert.ok(fs.existsSync(path.join(appDir, file)), `awarewave-files.txt lists ${file}, missing in next-admin`);
  if (!/\.(ts|js|mjs)$/.test(file)) continue; // a shipped .js module (cost-model.ts -> image-models.js) can import too
  // Type-only imports vanish under type stripping; every other relative import must ship too.
  const text = fs.readFileSync(path.join(appDir, file), "utf8");
  for (const [, kw, spec] of text.matchAll(/^\s*(import(?:\s+type)?|export)\b[^"']*?from\s+["'](\.{1,2}\/[^"']+)["']/gm)) {
    if (/^import\s+type$/.test(kw)) continue;
    const dep = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)).replace(/^(?!.*\.(?:ts|js|mjs|cjs)$)(.*)$/, "$1.ts"); // keep an explicit extension, else add .ts
    assert.ok(listed.has(dep), `${file} imports ${spec}; add ${dep} to awarewave-files.txt`);
  }
  // A package import resolves from this app's node_modules in the image (.awarewave/ has none): it must be a dependency here.
  for (const [, spec] of text.matchAll(/^\s*(?:import(?!\s+type\b)|export)\b[^"']*?from\s+["']([^."'/][^"']*)["']/gm)) {
    if (spec.startsWith("node:")) continue;
    const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    assert.ok(Object.hasOwn(dependencies, name), `${file} imports ${name}; add it to video-workbench package.json dependencies`);
  }
}
console.log("awarewave-files ok:", listed.size, "files listed,", reads, "runtime reads covered");
