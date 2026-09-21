import type { MediaItem, MediaRole } from "./catalog/types";

export type OmniVideoTask = "image_to_video" | "reference_to_video";

export type OmniInputPlan = {
  media: MediaItem[];
  task?: OmniVideoTask;
};

/** Resolve the two distinct ways images can guide Omni video generation.
 *
 * Frames are chronological constraints. References are an unordered creative
 * board. Keeping the choice explicit here as well as in the UI prevents a
 * stale or hand-built request from silently mixing both meanings. */
export function planOmniInput(
  media: Partial<Record<MediaRole, MediaItem[]>>,
): OmniInputPlan {
  const first = media.start?.[0];
  const last = media.end?.[0];
  const references = media.reference ?? [];
  const videos = media.video ?? [];

  if (references.length > 5) {
    throw new Error("Omni accepts up to 5 creative references in this studio");
  }
  if (references.length > 0 && (first || last)) {
    throw new Error("Choose either start/end frames or creative references for Omni");
  }
  if (videos.length > 1) {
    throw new Error("Omni accepts one primary MP4 source in this studio");
  }
  if (videos.length > 0 && (first || last)) {
    throw new Error("Choose either start/end frames or an MP4 source for Omni");
  }
  if (last && !first) {
    throw new Error("Add a start frame before using an end frame");
  }
  if (videos.length > 0) {
    return { media: [...videos, ...references] };
  }
  if (references.length > 0) {
    return { media: references, task: "reference_to_video" };
  }
  if (first && last) {
    return { media: [first, last] };
  }
  if (first) {
    return { media: [first], task: "image_to_video" };
  }
  return { media: [] };
}

export function omniSourcePrompt(media: MediaItem[], prompt: string): string {
  const hasVideo = media.some((item) => item.role === "video");
  const references = media.filter((item) => item.role === "reference");
  const tags: string[] = [];
  if (hasVideo) tags.push("[# Sources <VIDEO_0>@Video1]");
  if (references.length > 0) {
    const offset = hasVideo ? 1 : 0;
    tags.push(
      `[# References ${references.map((_, index) => `<IMAGE_REF_${index}>@Image${index + 1 + offset}`).join(" ")}]`,
    );
  }
  return tags.length ? `${tags.join(" ")}\n${prompt}` : prompt;
}
