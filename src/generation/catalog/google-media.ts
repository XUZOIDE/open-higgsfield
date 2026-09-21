import type { ModelEntry } from "./types";

const IMAGE_ASPECTS = [
  "1:1",
  "3:2",
  "2:3",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

const imageSettings = {
  aspectRatio: { type: "enum", values: IMAGE_ASPECTS, default: "1:1" },
  resolution: { type: "enum", values: ["1K", "2K", "4K"], default: "1K" },
} as const;

export const nanoBanana2: ModelEntry = {
  id: "gemini-3.1-flash-image",
  surface: "image",
  label: "Nano Banana 2",
  roles: { reference: 10, brief: 1 },
  settings: imageSettings,
};

export const nanoBananaPro: ModelEntry = {
  id: "gemini-3-pro-image",
  surface: "image",
  label: "Nano Banana Pro",
  roles: { reference: 14, brief: 1 },
  settings: imageSettings,
};

export const omni11Flash: ModelEntry = {
  id: "gemini-omni-1.1-flash-preview",
  surface: "video",
  label: "Omni 1.1 Flash",
  /* Omni accepts either a first/last-frame pair or creative source material:
     up to five image references plus one optional MP4. The picker keeps only
     the timeline-vs-creative distinction visible; file type is not a mode. */
  roles: { start: 1, end: 1, reference: 5, video: 1, brief: 1 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "9:16"], default: "16:9" },
    resolution: {
      type: "enum",
      values: ["360p", "720p", "1080p", "4k"],
      default: "720p",
    },
    duration: { type: "range", min: 3, max: 10, default: 5, step: 1 },
  },
};

export const landingAgent38: ModelEntry = {
  id: "landing-agent-gemini-3.8-high-omni-1.1",
  surface: "video",
  label: "Gemini 3.8 High → Omni",
  roles: { start: 1, end: 1, reference: 5, video: 1, brief: 1 },
  settings: omni11Flash.settings,
};

export const veo31: ModelEntry = {
  id: "veo-3.1-generate-001",
  surface: "video",
  label: "Veo 3.1",
  roles: { start: 1, end: 1, brief: 1 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "9:16"], default: "16:9" },
    resolution: { type: "enum", values: ["720p", "1080p"], default: "720p" },
    duration: { type: "range", min: 4, max: 8, default: 8, step: 2 },
  },
};
