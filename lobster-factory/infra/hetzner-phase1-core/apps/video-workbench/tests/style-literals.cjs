// U2.3: every font family and colour in styles/*.css comes from a token. tools.html shipped a system-ui stack and
// the editor stage hex black because nothing checked the workbench sheets (next-admin's style-contract only walks
// next-admin). A literal colour may appear only as a token definition (--name: value) in theme.css (--picture-*).
// Pure node: listed in tests/gate.cjs.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");

// CSS named colours (Color 4) and system colours; transparent / currentColor are not literals.
const NAMED = ("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
  "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen " +
  "darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray " +
  "darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia " +
  "gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender " +
  "lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink " +
  "lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon " +
  "mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise " +
  "mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
  "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red " +
  "rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow " +
  "springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen " +
  "accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext graytext highlight " +
  "highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext").split(" ").join("|");
const COLOUR = new RegExp(
  `#[0-9a-f]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|(?<![\\w-])(?:${NAMED})(?![\\w-])`, "i");
const FAMILY_TOKEN = /^(?:[^,]*\s)?var\(--font-family-[\w-]+\)$/, WIDE = /^(?:inherit|initial|unset|revert|revert-layer)$/i;

// Every rule's own declarations, nested rules included: the innermost { } body is read, then replaced by a marker so
// its parent's own declarations become innermost on the next pass. @font-face names a font, it does not pick one.
function declarations(css) {
  const out = [];
  let rest = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (let found = true; found; ) {
    found = false;
    rest = rest.replace(/([^{};]*)\{([^{}]*)\}/g, (_, prelude, body) => {
      found = true;
      if (!/@font-face/i.test(prelude))
        for (const decl of body.split(";")) {
          const i = decl.indexOf(":");
          if (i > 0) out.push([decl.slice(0, i).trim().toLowerCase(), decl.slice(i + 1).replace(/\s+/g, " ").replace(/\s*!important$/i, "").trim()]);
        }
      return ";";
    });
  }
  return out;
}

function styleLiterals(sheets) {
  const bad = [];
  for (const [file, css] of sheets)
    for (const [prop, value] of declarations(css)) {
      if (prop.startsWith("--") && file === "theme.css") continue;
      if ((prop === "font" || prop === "font-family") && !WIDE.test(value) && !FAMILY_TOKEN.test(value))
        bad.push(`${file}: ${prop}: ${value} (font family not from a --font-family-* token)`);
      const m = value.match(COLOUR);
      if (m) bad.push(`${file}: ${prop}: ${value} (literal colour ${m[0]})`);
    }
  return bad;
}

module.exports = { styleLiterals };

if (require.main === module) {
  // The checker itself: each kind of literal it exists to catch is caught, and the token forms pass.
  const probe = (decl, file = "probe.css") => styleLiterals([[file, `.a { ${decl}; }`]]).length;
  for (const d of ["font: 15px/1.6 system-ui, sans-serif", "font: 12px monospace", "font-family: Inter", "background: #000",
    "box-shadow: 0 0 0 1px #FFF8", "color: white", "color: whitesmoke", "background: rgba(0,0,0,.25)", "color: oklch(70% 0.1 200)",
    "text-shadow: 1px 1px black", "font-family: Inter, var(--font-family-base)", "color: CanvasText", "--local: red"])
    assert.equal(probe(d), 1, "not caught: " + d);
  assert.equal(styleLiterals([["probe.css", ".a { color: red; &:hover { color: var(--x); } }"]]).length, 1, "nested rule's parent not read");
  for (const d of ["font: var(--font-size-base)/var(--line-height-base) var(--font-family-base)", "font: inherit", "font: unset",
    "font-family: var(--font-family-mono) !important", "color: var(--red)", "background: transparent", "color: currentColor",
    "background: color-mix(in srgb, var(--body-bg) 60%, transparent)"])
    assert.equal(probe(d), 0, "false positive: " + d);
  assert.equal(probe("--picture-black: #000", "theme.css"), 0, "theme.css token definition refused");
  assert.equal(styleLiterals([["probe.css", "@font-face { font-family: 'Inter'; src: url(a.woff2); }"]]).length, 0, "@font-face read as a rule");
  const dir = path.join(__dirname, "../styles");
  const sheets = fs.readdirSync(dir).filter((f) => f.endsWith(".css")).map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]);
  assert.deepEqual(styleLiterals(sheets), [], "literal font family or colour in styles/*.css");
  console.log(`PASS style literals: ${sheets.length} stylesheets, fonts and colours from tokens only`);
}
