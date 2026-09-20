// Runs the dashboard's OWN serializer -- extracted verbatim from dashboard.html, never re-typed -- over the
// cases the Python mirror already serialized, and reports which methods disagree.
//
//   node tests/js/method_form_parity.js <dashboard.html> <cases.json>   ->  {"identical": N, "different": [...]}
//
// Called by tests/unit/test_method_form_examples.py. A divergence means CI is green while the browser sends
// something else, which is exactly how the 2026-09-19 form defect survived: nothing tested the real UI path.
const fs = require('fs');

const [, , dashboardPath, casesPath] = process.argv;
const html = fs.readFileSync(dashboardPath, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

function grab(startMarker) {
  const start = script.indexOf(startMarker);
  if (start < 0) throw new Error('not found in dashboard.html: ' + startMarker);
  let depth = 0;
  for (let j = script.indexOf('{', start); j < script.length; j++) {
    if (script[j] === '{') depth++;
    else if (script[j] === '}') { depth--; if (depth === 0) return script.slice(start, j + 1); }
  }
  throw new Error('unbalanced braces after: ' + startMarker);
}

const pieces = [
  script.match(/const ROW_PROVENANCE = \{[^}]*\};/)[0],
  script.match(/const AUTO_KINDS = new Set\(\[[^\]]*\]\);/)[0],
  grab('function isEmptyValue('),
  grab('function isObject('),
  grab('function collectDefs('),
  grab('function ruleHits('),
  grab('function collectValue('),
  grab('function collectFields('),
  grab('function upstreamMethodId('),
];
const mod = new Function(pieces.join('\n') + '\nreturn { collectFields, collectDefs, upstreamMethodId, isObject };')();

// collectPayload's own upstream branch, minus its network call: a whole upstream record already in the form
// state (a loaded example, or raw JSON pasted by the operator) is sent as-is.
function dashboardPayload(fields, data) {
  const payload = mod.collectFields(fields, data, null, mod.collectDefs(fields, {}));
  for (const f of fields) {
    if (f.kind !== 'upstream') continue;
    const up = (data.__upstream || {})[f.key];
    const methodId = mod.upstreamMethodId(f, data);
    if ((!up || !methodId || up.methodId !== methodId) && mod.isObject(data[f.key])) payload[f.key] = data[f.key];
  }
  return payload;
}

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((a, k) => (a[k] = canon(v[k]), a), {});
  return v;
}

const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
let identical = 0;
const different = [];
for (const [methodId, c] of Object.entries(cases)) {
  const js = JSON.stringify(canon(dashboardPayload(c.fields, c.input)));
  const py = JSON.stringify(canon(c.python));
  if (js === py) identical++;
  else different.push({ methodId, js: js.slice(0, 500), python: py.slice(0, 500) });
}
process.stdout.write(JSON.stringify({ identical, different, extractedBytes: pieces.join('\n').length }));
