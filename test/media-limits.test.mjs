import assert from "node:assert/strict";
import test from "node:test";

import {
  GOOGLE_INLINE_IMAGE_LIMIT,
  GOOGLE_INLINE_SAFE_BYTES,
  assertGoogleInlineImage,
  needsGoogleImageOptimization,
} from "../src/generation/media-limits.ts";

test("accepts a supported image at Google's exact inline limit", () => {
  assert.doesNotThrow(() =>
    assertGoogleInlineImage({ byteLength: GOOGLE_INLINE_IMAGE_LIMIT, mimeType: "image/png" }),
  );
});

test("blocks an oversized image before a provider request", () => {
  assert.throws(
    () => assertGoogleInlineImage({ byteLength: GOOGLE_INLINE_IMAGE_LIMIT + 1, mimeType: "image/png" }),
    /exceeds Google's 20 MB inline limit/,
  );
});

test("blocks image types unsupported by Google", () => {
  assert.throws(
    () => assertGoogleInlineImage({ byteLength: 1024, mimeType: "image/gif" }),
    /does not accept image\/gif/,
  );
});

test("marks legacy large images for optimization before generation", () => {
  assert.equal(
    needsGoogleImageOptimization({ byteLength: GOOGLE_INLINE_SAFE_BYTES + 1, mimeType: "image/png" }),
    true,
  );
  assert.equal(
    needsGoogleImageOptimization({ byteLength: GOOGLE_INLINE_SAFE_BYTES, mimeType: "image/png" }),
    false,
  );
  assert.equal(needsGoogleImageOptimization({ byteLength: 1024, mimeType: "image/gif" }), true);
});
