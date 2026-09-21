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

  if (references.length > 5) {
    throw new Error("Omni accepts up to 5 creative references in this studio");
  }
  if (references.length > 0 && (first || last)) {
    throw new Error("Choose either start/end frames or creative references for Omni");
  }
  if (last && !first) {
    throw new Error("Add a start frame before using an end frame");
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
