import assert from "node:assert/strict";
import test from "node:test";

import {
  embedMotionVideo,
  extractStandaloneHtml,
  validateStandaloneHtml,
} from "../src/generation/landing-html.ts";

const valid = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{margin:0}</style></head><body><video src="{{MOTION_VIDEO_DATA_URI}}"></video><script>document.body.dataset.ready="1"</script></body></html>`;

test("extracts one complete standalone document from a fenced response", () => {
  assert.equal(extractStandaloneHtml(`Here it is:\n\`\`\`html\n${valid}\n\`\`\``), valid);
});

test("accepts an inline, offline document", () => {
  assert.deepEqual(validateStandaloneHtml(valid), []);
});

test("rejects external dependencies and network calls", () => {
  const broken = valid.replace("<style>", '<script src="https://cdn.example/x.js"></script><style>')
    .replace("document.body.dataset.ready=\"1\"", 'fetch("https://example.com")');
  assert.match(validateStandaloneHtml(broken).join(" "), /External scripts.*Network calls/);
});

test("embeds the approved motion reference without another file", () => {
  const embedded = embedMotionVideo(valid, "video/mp4", "YWJj");
  assert.match(embedded, /data:video\/mp4;base64,YWJj/);
  assert.doesNotMatch(embedded, /MOTION_VIDEO_DATA_URI/);
});
