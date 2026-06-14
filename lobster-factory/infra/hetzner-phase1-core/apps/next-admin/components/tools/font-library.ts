/**
 * Font library — Google Fonts (CJK + Latin) + custom-font upload, ported from the
 * vector-trace-demo.html prototype's 字型庫 into a reusable, framework-agnostic module.
 *
 * Reusable block: any tool can import the data + loaders here and the <FontLibrary/> picker.
 * CJK = Google Noto traditional-Chinese fonts (TC/HK, no simplified). Latin = a curated set.
 * Google Fonts are injected via one <link> per group (CJK separate so its big payload can't
 * delay the Latin set). Uploaded fonts use the FontFace API (valid for the current session).
 */

export const CJK_FONTS = ["Noto Sans TC", "Noto Serif TC", "Noto Sans HK", "Noto Serif HK"];

export const LATIN_FONTS = [
  "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Inter", "Nunito", "Raleway",
  "Work Sans", "Rubik", "Manrope", "DM Sans", "Mulish", "Ubuntu", "Fredoka", "Kanit",
  "Merriweather", "Playfair Display", "Lora", "PT Serif", "Cormorant", "EB Garamond", "Bitter",
  "Crimson Text", "Cinzel", "Roboto Mono", "JetBrains Mono", "Source Code Pro", "Space Mono",
  "Pacifico", "Lobster", "Bebas Neue", "Anton", "Oswald", "Righteous", "Abril Fatface",
  "Archivo Black", "Teko", "Dancing Script", "Caveat", "Permanent Marker", "Sacramento",
  "Great Vibes", "Satisfy", "Shadows Into Light", "Comfortaa", "Quicksand", "Bungee",
];

/** CJK first so it's easy to find in the list. */
export const GOOGLE_FONTS = [...CJK_FONTS, ...LATIN_FONTS];

export function isCjkFont(name: string): boolean {
  return CJK_FONTS.includes(name);
}

let injected = false;
/** Inject the Google Fonts stylesheets once (idempotent). CJK + Latin as separate requests. */
export function ensureGoogleFonts(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const link = (families: string[]) => {
    if (!families.length) return;
    const el = document.createElement("link");
    el.rel = "stylesheet";
    el.href =
      "https://fonts.googleapis.com/css?family=" +
      families.map((f) => f.replace(/ /g, "+")).join("|") +
      "&display=swap";
    document.head.appendChild(el);
  };
  link(CJK_FONTS);
  link(LATIN_FONTS);
}

/** Ensure a font's glyphs are loaded before it's applied (so the first render isn't a fallback). */
export async function loadFont(name: string): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    await document.fonts.load(`20px "${name}"`);
  } catch {
    /* font may be a system stack or already loaded — non-fatal */
  }
}

/** Load a user-uploaded font file via FontFace. Returns the registered family name. */
export async function loadUploadedFont(file: File): Promise<string> {
  const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, "");
  const buf = await file.arrayBuffer();
  const ff = new FontFace(name, buf);
  await ff.load();
  (document.fonts as unknown as { add: (f: FontFace) => void }).add(ff);
  return name;
}
