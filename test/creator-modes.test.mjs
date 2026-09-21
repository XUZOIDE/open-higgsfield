import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATOR_DEFAULT_MODELS,
  CREATOR_SURFACES,
  promptWithCreatorGuidance,
} from "../src/generation/creator-modes.ts";

test("specialised creators resolve to an honest output surface and model", () => {
  assert.equal(CREATOR_SURFACES.landing, "video");
  assert.equal(CREATOR_DEFAULT_MODELS.landing, "landing-agent-gemini-3.8-high-omni-1.1");
  assert.equal(CREATOR_SURFACES.webapp, "image");
  assert.equal(CREATOR_SURFACES.mobile, "image");
  assert.equal(CREATOR_DEFAULT_MODELS.webapp, "gemini-3-pro-image");
});

test("hidden creator guidance preserves the user's request", () => {
  const result = promptWithCreatorGuidance("webapp", "A dispatch exception queue");
  assert.match(result, /desktop web application UX\/UI concept/);
  assert.match(result, /User request:\nA dispatch exception queue$/);
});
