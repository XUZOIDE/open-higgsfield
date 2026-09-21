export const GOOGLE_INLINE_IMAGE_LIMIT = 20 * 1024 * 1024;
export const GOOGLE_INLINE_SAFE_BYTES = 18 * 1024 * 1024;

const GOOGLE_INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function isGoogleInlineImageType(mimeType: string): boolean {
  return GOOGLE_INLINE_IMAGE_TYPES.has(mimeType);
}

export function needsGoogleImageOptimization(media: { byteLength: number; mimeType: string }): boolean {
  return media.mimeType.startsWith("image/") &&
    (!isGoogleInlineImageType(media.mimeType) || media.byteLength > GOOGLE_INLINE_SAFE_BYTES);
}

export function assertGoogleInlineImage(media: { byteLength: number; mimeType: string }): void {
  if (!isGoogleInlineImageType(media.mimeType)) {
    throw new Error(`Google does not accept ${media.mimeType || "this file type"} as an inline image`);
  }
  if (media.byteLength > GOOGLE_INLINE_IMAGE_LIMIT) {
    throw new Error(
      "Input image exceeds Google's 20 MB inline limit. Remove it and upload it again so the app can optimize it before generation",
    );
  }
}
