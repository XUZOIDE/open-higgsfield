export const GOOGLE_INLINE_IMAGE_LIMIT = 20 * 1024 * 1024;
export const GOOGLE_INLINE_SAFE_BYTES = 18 * 1024 * 1024;

const GOOGLE_INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function assertGoogleInlineImage(media: { byteLength: number; mimeType: string }): void {
  if (!GOOGLE_INLINE_IMAGE_TYPES.has(media.mimeType)) {
    throw new Error(`Google does not accept ${media.mimeType || "this file type"} as an inline image`);
  }
  if (media.byteLength > GOOGLE_INLINE_IMAGE_LIMIT) {
    throw new Error(
      "Input image exceeds Google's 20 MB inline limit. Remove it and upload it again so the app can optimize it before generation",
    );
  }
}
