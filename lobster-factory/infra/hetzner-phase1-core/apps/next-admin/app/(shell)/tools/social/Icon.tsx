// The mock's line icons (social-manager-mock.html const ICON), only the ones the frame uses; stroke = currentColor.
const PATHS = {
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0", chevL: "M15 18l-6-6 6-6", chevR: "M9 18l6-6-6-6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3", filter: "M3 4h18l-7 8v6l-4 2v-8z", plus: "M12 5v14M5 12h14", x: "M18 6L6 18M6 6l12 12",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1", calendar: "M3 5h18v16H3zM16 3v4M8 3v4M3 10h18",
  vdots: "M12 5h.01M12 12h.01M12 19h.01", arrowL: "M19 12H5M12 19l-7-7 7-7", star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6", report: "M5 3h10l4 4v14H5zM14 3v5h5M9 17v-3M12 17v-6M15 17v-2", inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v7H2v-7z",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", copy: "M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6", up: "M12 19V5M5 12l7-7 7 7",
  flow: "M6 3v4M6 17v4M4 7h4v10H4zM16 7h4v4h-4zM16 13h4v4h-4zM8 12h4l2-3M12 12l2 3",
} as const;
export type IconName = keyof typeof PATHS;

export default function Icon({ name }: { name: IconName }) {
  return <svg className="sm-i" viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name]} /></svg>;
}
