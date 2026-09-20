import { NextResponse } from "next/server";

import { currentUserId } from "@/generation/current-user";
import { readLocalMedia } from "@/generation/vertex";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
): Promise<NextResponse> {
  try {
    const { filename } = await context.params;
    const media = await readLocalMedia(await currentUserId(), filename);
    return new NextResponse(media.data.buffer.slice(media.data.byteOffset, media.data.byteOffset + media.data.byteLength) as ArrayBuffer, {
      headers: {
        "Content-Type": media.mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Media not found", { status: 404 });
  }
}
