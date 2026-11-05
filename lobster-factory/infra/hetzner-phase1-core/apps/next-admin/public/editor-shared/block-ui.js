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
