import assert from "node:assert/strict";
import test from "node:test";

import { mp4DurationSeconds, omniEditedDuration } from "../src/generation/mp4-duration.ts";

function box(type, payload) {
  const bytes = new Uint8Array(8 + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  for (let index = 0; index < 4; index++) bytes[4 + index] = type.charCodeAt(index);
  bytes.set(payload, 8);
  return bytes;
}

test("reads the movie duration from a version 0 MP4 header", () => {
  const payload = new Uint8Array(20);
  const view = new DataView(payload.buffer);
  view.setUint32(12, 1_000);
  view.setUint32(16, 5_958);
  const mp4 = box("moov", box("mvhd", payload));
  assert.equal(mp4DurationSeconds(mp4), 5.958);
});

test("reads the movie duration from a version 1 MP4 header", () => {
  const payload = new Uint8Array(32);
  const view = new DataView(payload.buffer);
  payload[0] = 1;
  view.setUint32(20, 48_000);
  view.setBigUint64(24, 288_000n);
  const mp4 = box("moov", box("mvhd", payload));
  assert.equal(mp4DurationSeconds(mp4), 6);
});

test("uses the provider's one-decimal edit-duration comparison", () => {
  assert.equal(omniEditedDuration(5.958, 5), 6);
  assert.equal(omniEditedDuration(Number.NaN, 5), 5);
});
