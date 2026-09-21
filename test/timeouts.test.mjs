import assert from "node:assert/strict";
import test from "node:test";

import { GOOGLE_MEDIA_REQUEST_TIMEOUT_MS } from "../src/generation/timeouts.ts";

test("keeps Google media requests alive for ten minutes", () => {
  assert.equal(GOOGLE_MEDIA_REQUEST_TIMEOUT_MS, 600_000);
});
