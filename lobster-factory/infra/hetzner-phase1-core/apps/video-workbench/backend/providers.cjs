// The one rule for every vendor list the pages offer as buttons (speech.cjs, transcribe.cjs, image-to-3d.cjs, and any list
// added later). Operator 2026-11-10: 「使用免費和付費的 但是要先使用免費為主」.
// - Order: free rows first, then paid rows, each in the list's own order.
// - Default: the row the environment names when it can run here; else the first free row that can run; else the first paid
//   row that can run; else the first row (shown unavailable).
// Rows: { id, available, free }. free = its price is 0 (provider-cost.cjs, the same price the button shows).
const order = (rows) => [...rows.filter((r) => r.free), ...rows.filter((r) => !r.free)];
function choose(rows, wanted) {
  const list = order(rows);
  return list.find((r) => r.id === wanted && r.available) || list.find((r) => r.free && r.available) || list.find((r) => r.available) || list[0];
}
module.exports = { order, choose };
