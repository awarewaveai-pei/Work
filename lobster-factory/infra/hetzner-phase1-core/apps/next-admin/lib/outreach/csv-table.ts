// A Meta lead-ad CSV export in the browser (card C14.1): Ads Manager downloads UTF-16 with tabs, other tools UTF-8 with
// commas. decodeCsv picks the encoding from the BOM; parseCsv picks the delimiter from the header line.
export function decodeCsv(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  return new TextDecoder("utf-8").decode(b).replace(/^\uFEFF/, "");
}

/** Quoted fields may hold the delimiter, doubled quotes and line breaks. Returns the header row and the data rows. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const head = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", "\t", ";"].map((d) => ({ d, n: head.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const all: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      all.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); all.push(row); }
  const [headers = [], ...rows] = all.filter((r) => r.some((x) => x.trim() !== ""));
  return { headers: headers.map((h) => h.trim()), rows };
}
