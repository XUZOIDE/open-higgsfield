import { GOOGLE_INLINE_SAFE_BYTES } from "./media-limits";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_EDGE = 4096;

export async function uploadMedia(file: File): Promise<{ url: string }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds 50 MB");
  const prepared = await prepareImageForGoogle(file);
  const body = new FormData();
  body.set("file", prepared);
  const res = await fetch("/api/media", {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error((await res.text()) || "Local upload failed");
  const payload = (await res.json()) as { url?: unknown };
  if (typeof payload.url !== "string") throw new Error("Local upload returned no URL");
  return { url: payload.url };
}

/** Google accepts at most 20 MB for inline images. Keep the local picker at
    50 MB, but turn oversized screenshots into a compact WebP before they ever
    reach storage or a billable model request. */
async function prepareImageForGoogle(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size <= GOOGLE_INLINE_SAFE_BYTES) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image is over 20 MB and could not be optimized. Export it as PNG, JPEG, or WebP and retry");
  }

  try {
    let scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Browser image conversion is unavailable");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas, "image/webp", Math.max(0.68, 0.9 - attempt * 0.06));
      if (blob.size <= GOOGLE_INLINE_SAFE_BYTES) {
        const stem = file.name.replace(/\.[^.]+$/, "") || "upload";
        return new File([blob], `${stem}.webp`, { type: "image/webp", lastModified: file.lastModified });
      }
      scale *= 0.78;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("This image could not be reduced below Google's 20 MB input limit");
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Browser image conversion failed"));
    }, type, quality);
  });
}
