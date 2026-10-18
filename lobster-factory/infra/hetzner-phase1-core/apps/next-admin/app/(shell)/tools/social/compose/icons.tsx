// The composer's tool icons (mock const ICON); the frame's shared ones stay in ../Icon.tsx. Same markup: stroke = currentColor.
import Icon, { type IconName } from "../Icon";

const PATHS = {
  comment: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z", eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  lines: "M4 6h16M4 12h16M4 18h10", spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01", image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01",
  note: "M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h5", up: "M12 19V5M5 12l7-7 7 7", down: "M12 5v14M19 12l-7 7-7-7", trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2", tag: "M3 12V3h9l9 9-9 9zM7.5 7.5h.01", chevD: "M6 9l6 6 6-6",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
} as const;
type ComposeIconName = keyof typeof PATHS;

export default function CIcon({ name }: { name: ComposeIconName | IconName }) {
  if (!(name in PATHS)) return <Icon name={name as IconName} />;
  return <svg className="sm-i" viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name as ComposeIconName]} /></svg>;
}
