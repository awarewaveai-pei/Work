// Visible button group instead of a <select> (operator rule: no dropdowns). Shared by the blocks that offer a choice; lives outside blocks/ so it is not a panel.
// Buttons use the app's tab classes (`tab`, `tab--active`); the selected value is also in aria-pressed.
export function choiceGroup(options, value, onChange) {
  const el = document.createElement("div");
  el.className = "row"; el.style.flexWrap = "wrap"; el.setAttribute("role", "group");
  let cur = value;
  const buttons = options.map(([v, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tab"; b.dataset.v = v; b.textContent = label;
    b.onclick = () => { cur = v; paint(); if (onChange) onChange(v); };
    el.appendChild(b);
    return b;
  });
  function paint() {
    buttons.forEach((b) => { const on = b.dataset.v === cur; b.classList.toggle("tab--active", on); b.setAttribute("aria-pressed", String(on)); });
  }
  paint();
  return { el, get: () => cur, set: (v) => { cur = v; paint(); } };
}

/** A model button: 「<名稱>　NT$<價>」 and the row's note under it. `m` = a catalog row (image-models.js). */
export function modelButton(m, nt, onClick, kind = "btn-primary") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn " + kind;
  b.style.cssText = "display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;line-height:1.3;";
  const top = document.createElement("span");
  // Two decimals, same as everywhere else: nt() alone printed NT$1.6 next to the guide's NT$1.60.
  top.textContent = m.label + "\u3000NT$" + nt(m.usd).toFixed(2);
  const note = document.createElement("small");
  note.textContent = m.note || "";
  note.style.cssText = "opacity:.75;font-size:11px;";
  b.append(top, note);
  // Which language this model's instruction has to be in (image-models.js `zh`, measured). On the button face, not
  // in a tooltip: 2026-11-09 two 繁中 presses on a "no" model left the image unchanged and still billed.
  if (m.zh === "ok" || m.zh === "no") {
    const lang = document.createElement("small");
    lang.textContent = m.zh === "ok" ? "指令：中文可以" : "指令：要寫英文";
    lang.style.cssText = m.zh === "ok"
      ? "opacity:.6;font-size:11px;"
      : "font-size:11px;font-weight:700;color:var(--danger);";
    b.append(lang);
  }
  b.onclick = onClick;
  return b;
}
