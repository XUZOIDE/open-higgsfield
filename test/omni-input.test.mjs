import assert from "node:assert/strict";
import test from "node:test";

import { omni11Flash } from "../src/generation/catalog/google-media.ts";
import { omniSourcePrompt, planOmniInput } from "../src/generation/omni-input.ts";

const item = (role, url) => ({ id: `${role}-${url}`, role, url });

test("catalog exposes frames, references, one MP4 source and one PDF brief", () => {
  assert.deepEqual(omni11Flash.roles, { start: 1, end: 1, reference: 5, video: 1, brief: 1 });
});

test("a single start frame selects image-to-video", () => {
  const start = item("start", "start.png");
  assert.deepEqual(planOmniInput({ start: [start] }), {
    media: [start],
    task: "image_to_video",
  });
});

test("start and end are passed in chronological order without forcing a task", () => {
  const start = item("start", "start.png");
  const end = item("end", "end.png");
  assert.deepEqual(planOmniInput({ start: [start], end: [end] }), {
    media: [start, end],
  });
});

test("five unordered references select reference-to-video", () => {
  const references = Array.from({ length: 5 }, (_, index) =>
    item("reference", `ref-${index}.png`),
  );
  assert.deepEqual(planOmniInput({ reference: references }), {
    media: references,
    task: "reference_to_video",
  });
});

test("frames and references cannot be mixed silently", () => {
  assert.throws(
    () =>
      planOmniInput({
        start: [item("start", "start.png")],
        reference: [item("reference", "ref.png")],
      }),
    /either start\/end frames or creative references/,
  );
});

test("an end frame without a start frame is rejected", () => {
  assert.throws(
    () => planOmniInput({ end: [item("end", "end.png")] }),
    /start frame before using an end frame/,
  );
});

test("an MP4 source can carry image references without becoming a timeline", () => {
  const video = item("video", "source.mp4");
  const reference = item("reference", "character.png");
  assert.deepEqual(planOmniInput({ video: [video], reference: [reference] }), {
    media: [video, reference],
  });
});

test("an MP4 source and image references receive explicit Omni source tags", () => {
  const media = [item("video", "source.mp4"), item("reference", "character.png")];
  assert.equal(
    omniSourcePrompt(media, "Continue the scene"),
    "[# Sources <VIDEO_0>@Video1] [# References <IMAGE_REF_0>@Image2]\nContinue the scene",
  );
});

test("an MP4 source cannot be mixed with start or end frames", () => {
  assert.throws(
    () => planOmniInput({ video: [item("video", "source.mp4")], start: [item("start", "start.png")] }),
    /either start\/end frames or an MP4 source/,
  );
});
