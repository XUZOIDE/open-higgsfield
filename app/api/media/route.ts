import { NextResponse } from "next/server";

import { currentUserId } from "@/generation/current-user";
import { saveLocalMedia } from "@/generation/vertex";

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/wav",
  "audio/x-wav",
]);

export async function POST(request: Request): Promise<NextResponse> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 31 * 1024 * 1024) return new NextResponse("Upload exceeds 30 MB", { status: 413 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new NextResponse("Missing file", { status: 400 });
  if (!ALLOWED.has(file.type)) return new NextResponse("Unsupported media type", { status: 415 });
  if (file.size > 30 * 1024 * 1024) return new NextResponse("File exceeds 30 MB", { status: 413 });
  const url = await saveLocalMedia(await currentUserId(), new Uint8Array(await file.arrayBuffer()), file.type);
  return NextResponse.json({ url });
}
