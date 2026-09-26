// Glyphs and tool pictures come from the catalog (display_catalog.py GLYPHS / SHAPES, our own server): path markup only.
export function Glyph({ paths, label }: { paths: string; label?: string }) {
  return label
    ? <svg className="glyph" viewBox="0 0 24 24" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: paths }} />
    : <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths }} />;
}

export function Picture({ paths, label }: { paths: string; label: string }) {
  return <svg className="shape" viewBox="0 0 64 40" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: paths }} />;
}
