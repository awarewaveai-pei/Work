import { PhotoProFrame } from "../../(full)/tools/photo-pro/PhotoProFrame";

export const metadata = { title: "畫布" };

// design.<base domain>/canvas: the same PhotoCraft frame as /tools/photo-pro (R0-PLAN 2026-11-05-photocraft-pro C7.1;
// the door path stays `canvas`, its nav item's staff page is tools/photo-pro).
export default function DesignCanvasPage() {
  return <PhotoProFrame />;
}
