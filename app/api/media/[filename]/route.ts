import { NextResponse } from "next/server";

import { currentUserId } from "@/generation/current-user";
import { inspectLocalMedia, readLocalMedia } from "@/generation/vertex";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
): Promise<NextResponse> {
  try {
    const { filename } = await context.params;
    const media = await readLocalMedia(await currentUserId(), filename);
    const isHtml = media.mimeType === "text/html";
    return new NextResponse(media.data.buffer.slice(media.data.byteOffset, media.data.byteOffset + media.data.byteLength) as ArrayBuffer, {
      headers: {
        "Content-Type": media.mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        ...(isHtml
          ? {
              "Content-Security-Policy":
                "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
              "Referrer-Policy": "no-referrer",
            }
          : {}),
      },
    });
  } catch {
    return new NextResponse("Media not found", { status: 404 });
  }
}

export async function HEAD(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
): Promise<NextResponse> {
  try {
    const { filename } = await context.params;
    const media = await inspectLocalMedia(await currentUserId(), filename);
    return new NextResponse(null, {
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(media.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
