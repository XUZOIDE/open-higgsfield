import type { CreatorMode, Surface } from "./catalog/types";

export const CREATOR_MODES: readonly CreatorMode[] = [
  "image",
  "video",
  "landing",
  "webapp",
  "mobile",
];

export const CREATOR_LABELS: Record<CreatorMode, string> = {
  image: "Image",
  video: "Video",
  landing: "Landing Page",
  webapp: "Webapp Design",
  mobile: "Mobile Design",
};

export const CREATOR_SURFACES: Record<CreatorMode, Surface> = {
  image: "image",
  video: "video",
  landing: "video",
  webapp: "image",
  mobile: "image",
};

export const CREATOR_DEFAULT_MODELS: Record<CreatorMode, string> = {
  image: "gemini-3.1-flash-image",
  video: "gemini-omni-1.1-flash-preview",
  landing: "landing-agent-gemini-3.8-high-omni-1.1",
  webapp: "gemini-3-pro-image",
  mobile: "gemini-3-pro-image",
};

export const CREATOR_PROMPT_GUIDANCE: Record<CreatorMode, string> = {
  image:
    "Create the requested image. Preserve explicit brand, composition, text and exclusion constraints from the user and any attached brief.",
  video:
    "Create the requested video. Treat camera, motion, continuity, timing, audio and exclusion constraints as production requirements.",
  landing:
    "Build and iteratively refine a premium standalone landing page. Plan a coherent scroll story with clearly separable foreground, midground and background layers, restrained depth, intentional parallax, readable focal hierarchy and production-quality responsive HTML, CSS and JavaScript. Preserve successful decisions from the active project session.",
  webapp:
    "Create a production-minded desktop web application UX/UI concept, not a marketing landing page. Show a believable primary workflow, clear information hierarchy, consistent components, useful states and realistic data density. The result is a visual implementation reference, not executable code.",
  mobile:
    "Create a production-minded native mobile UX/UI concept. Respect safe areas, touch targets, platform navigation patterns, content hierarchy, useful states and one-handed ergonomics. The result is a visual implementation reference, not executable code.",
};

export function isCreatorMode(value: unknown): value is CreatorMode {
  return typeof value === "string" && CREATOR_MODES.includes(value as CreatorMode);
}

export function creatorForSurface(surface: Surface): CreatorMode {
  return surface;
}

export function promptWithCreatorGuidance(mode: CreatorMode, prompt: string): string {
  return `${CREATOR_PROMPT_GUIDANCE[mode]}\n\nUser request:\n${prompt.trim()}`;
}
