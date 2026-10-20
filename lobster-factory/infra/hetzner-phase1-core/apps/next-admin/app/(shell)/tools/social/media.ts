/** Browser-only upload helpers. The crop is deliberately a reversible upload choice: the original file is never changed. */

export const MAX_IMAGE_UPLOAD = 10 * 1024 * 1024;   // uploadMedia's cap (lib/content/postiz.ts)
// The file travels base64 inside a JSON body (+1/3), and nginx caps that body at 50M (nginx/default.conf
// client_max_body_size, app server block); 36 MiB raw leaves ~1 MiB for the rest of the body. postiz.ts's 200 MB
// cap applies only to https video URLs. Raising this needs a streamed upload, not a bigger nginx limit.
export const MAX_VIDEO_UPLOAD = 36 * 1024 * 1024;

/** The refusal shown to the user, or null when the file fits. */
export function uploadTooLarge(file: File): string | null {
  if (file.type.startsWith("video/")) return file.size > MAX_VIDEO_UPLOAD ? "影片超過 36 MB。" : null;
  return file.size > MAX_IMAGE_UPLOAD ? "圖片超過 10 MB。" : null;
}
export async function fileDataUrl(file: File, square = false): Promise<string> {
  if (!square || !file.type.startsWith("image/")) return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = side; canvas.height = side;
    canvas.getContext("2d")?.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, side, side);
    return canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.92);
  } finally { bitmap.close(); }
}
