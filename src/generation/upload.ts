import type { GenerationPlane, MediaItem } from "./catalog/types";
import { GOOGLE_INLINE_SAFE_BYTES, needsGoogleImageOptimization } from "./media-limits";

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
  if (!needsGoogleImageOptimization({ byteLength: file.size, mimeType: file.type })) {
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

/** Sessions created before client-side optimization can still reference a
    large local image. Upgrade those URLs before a paid request. */
export async function prepareGenerationMedia(
  plane: GenerationPlane,
): Promise<{ plane: GenerationPlane; replacements: Map<string, string> }> {
  const replacements = new Map<string, string>();
  const media: GenerationPlane["media"] = {};

  for (const [role, items] of Object.entries(plane.media) as Array<[keyof GenerationPlane["media"], MediaItem[]]>) {
    const prepared: MediaItem[] = [];
    for (const item of items) {
      let url = replacements.get(item.url) ?? item.url;
      if (url === item.url && item.url.startsWith("/api/media/")) {
        const head = await fetch(item.url, { method: "HEAD", cache: "no-store" });
        if (!head.ok) throw new Error(`Could not inspect attached media (${head.status})`);
        const byteLength = Number(head.headers.get("content-length") || 0);
        const mimeType = head.headers.get("content-type")?.split(";")[0] || "";
        if (needsGoogleImageOptimization({ byteLength, mimeType })) {
          const response = await fetch(item.url, { cache: "no-store" });
          if (!response.ok) throw new Error(`Could not read attached media (${response.status})`);
          const blob = await response.blob();
          const filename = item.url.split("/").pop() || "attached-image";
          url = (await uploadMedia(new File([blob], filename, { type: mimeType || blob.type }))).url;
          replacements.set(item.url, url);
        }
      }
      prepared.push(url === item.url ? item : { ...item, url });
    }
    media[role] = prepared;
  }

  return { plane: { ...plane, media }, replacements };
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Browser image conversion failed"));
    }, type, quality);
  });
}
