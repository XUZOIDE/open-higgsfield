import assert from "node:assert/strict";
import test from "node:test";

import { omni11Flash } from "../src/generation/catalog/google-media.ts";
import { planOmniInput } from "../src/generation/omni-input.ts";

const item = (role, url) => ({ id: `${role}-${url}`, role, url });

test("catalog exposes start/end frames and five creative references", () => {
  assert.deepEqual(omni11Flash.roles, { start: 1, end: 1, reference: 5 });
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
