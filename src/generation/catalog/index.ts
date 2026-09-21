import { landingAgent38, nanoBanana2, nanoBananaPro, omni11Flash, veo31 } from "./google-media";
import { parseSettings } from "./parse-settings";
import type { ModelEntry } from "./types";

export const MODELS: readonly ModelEntry[] = [
  nanoBanana2,
  nanoBananaPro,
  omni11Flash,
  landingAgent38,
  veo31,
];

export function getModel(id: string): ModelEntry {
  const model = MODELS.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown model: ${id}`);
  return model;
}

export type { CreatorMode, GenerationPlane, MediaItem, MediaRole, ModelEntry, PlatformPaths, Surface } from "./types";
export { parseSettings };
