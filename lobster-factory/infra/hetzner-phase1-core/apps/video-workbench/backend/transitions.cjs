// The transitions module's export side (card R2 item 11): how a stored transition becomes an FFmpeg instruction. The list
// itself is next-admin public/editor-shared/transitions.js (read through shared/editor-model.js); nothing here names a
// transition by its stored name.
const path = require("node:path"),
  EditorModel = require("../shared/editor-model.js"),
  Transitions = require(path.join(require("./appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "public/editor-shared/transitions.js"));

// Card ED.7 轉場曲線 (formula in EditorModel.TRANSITION_CURVES, shared with the preview): xfade progress P runs 1 -> 0,
// so T = 1 - P is the linear 0 -> 1 progress the formula reads.
// Each effect is xfade's own, re-stated with the curved progress S (a hard-edged circle; slides have no curved form).
const CURVED_TRANSITIONS = {
  fade: (s) => `A*(1-${s})+B*${s}`,
  fadeblack: (s) => {
    const k = "if(between(PLANE,1,2),128,16)";
    return `if(lt(${s},0.5),A*(1-2*${s})+${k}*2*${s},${k}*(2-2*${s})+B*(2*${s}-1))`;
  },
  wipeleft: (s) => `if(lt(X,W*${s}),B,A)`,
  wiperight: (s) => `if(gt(X,W*(1-${s})),B,A)`,
  circleopen: (s) => `if(lte(hypot(X-W/2,Y-H/2),hypot(W/2,H/2)*${s}),B,A)`,
};
const curvedTransition = (type, curve) => CURVED_TRANSITIONS[type](`(${EditorModel.TRANSITION_CURVES[curve]})`).replaceAll("T", "(1-P)");

// A 片頭／片尾 transition as video-service joins it (backend/quick-render.cjs; the main system's automatic videos use the
// same Transitions.bookend): any stored name, old ones included -> video-service's name (Transitions LIST bookend). A transition it
// cannot make is refused by name, never turned into 溶解.
function bookendTransition(v) {
  const name = Transitions.name(v), wire = name === null ? null : Transitions.bookend(name);
  if (wire === null) throw Object.assign(Error(name ? "「" + name + "」：" + Transitions.BOOKEND_UNSUPPORTED : "轉場設定無效"), { status: 400 });
  return wire;
}

module.exports = { Transitions, CURVED_TRANSITIONS, curvedTransition, bookendTransition };
