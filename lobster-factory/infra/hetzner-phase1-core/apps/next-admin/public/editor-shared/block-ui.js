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
  top.textContent = m.label + "\u3000NT$" + nt(m.usd);
  const note = document.createElement("small");
  note.textContent = m.note || "";
  note.style.cssText = "opacity:.75;font-size:11px;";
  b.append(top, note);
  b.onclick = onClick;
  return b;
}
