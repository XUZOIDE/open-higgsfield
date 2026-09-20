import { NextResponse } from "next/server";

import { currentUserId } from "@/generation/current-user";
import { saveLocalMedia } from "@/generation/vertex";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 52 * 1024 * 1024;

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
  if (contentLength > MAX_MULTIPART_BYTES) return new NextResponse("Upload exceeds 50 MB", { status: 413 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new NextResponse("Missing file", { status: 400 });
  if (!ALLOWED.has(file.type)) return new NextResponse("Unsupported media type", { status: 415 });
  if (file.size > MAX_UPLOAD_BYTES) return new NextResponse("File exceeds 50 MB", { status: 413 });
  const url = await saveLocalMedia(await currentUserId(), new Uint8Array(await file.arrayBuffer()), file.type);
  return NextResponse.json({ url });
}
