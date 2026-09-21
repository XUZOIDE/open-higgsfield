export type Surface = "image" | "video";
export type CreatorMode = "image" | "video" | "landing" | "webapp" | "mobile";
export type MediaRole = "start" | "end" | "reference" | "video" | "audio" | "brief";

export type MediaItem = {
  id: string;
  url: string;
  role: MediaRole;
};

export type SettingField =
  | { type: "enum"; values: readonly string[]; default: string }
  | { type: "range"; min: number; max: number; default: number; step?: number }
  | { type: "boolean"; default: boolean };

export type PlatformPaths = {
  text?: string;
  image?: string;
  firstLast?: string;
  reference?: string;
};

export type ModelEntry = {
  id: string;
  surface: Surface;
  label: string;
  roles: Partial<Record<MediaRole, number>>;
  settings: Record<string, SettingField>;
  /** Submit paths when the shared mapper is enough. Soul, Kling 3, and Seedance keep custom maps. */
  paths?: PlatformPaths;
};

export type GenerationPlane = {
  model: string;
  creatorMode: CreatorMode;
  /** Persistent coordinator thread used by iterative landing-page builds. */
  sessionId?: string;
  prompt: { text: string };
  media: Partial<Record<MediaRole, MediaItem[]>>;
  settings: Record<string, unknown>;
};
