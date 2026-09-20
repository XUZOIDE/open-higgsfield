export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function uploadMedia(file: File): Promise<{ url: string }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds 50 MB");
  const body = new FormData();
  body.set("file", file);
  const res = await fetch("/api/media", {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error((await res.text()) || "Local upload failed");
  const payload = (await res.json()) as { url?: unknown };
  if (typeof payload.url !== "string") throw new Error("Local upload returned no URL");
  return { url: payload.url };
}
