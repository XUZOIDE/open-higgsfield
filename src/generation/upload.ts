export async function uploadMedia(file: File): Promise<{ url: string }> {
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
