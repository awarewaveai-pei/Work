// The transitions module's export side (card R2 item 11): how a stored transition becomes an FFmpeg instruction. The list
// itself is next-admin public/editor-shared/transitions.js (read through shared/editor-model.js); nothing here names a
// transition by its stored name.
const EditorModel = require("../shared/editor-model.js");

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

module.exports = { CURVED_TRANSITIONS, curvedTransition };
