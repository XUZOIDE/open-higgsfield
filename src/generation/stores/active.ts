import { create } from "zustand";
import { persist } from "zustand/middleware";

import { getModel } from "../catalog";
import { CREATOR_DEFAULT_MODELS, CREATOR_SURFACES, creatorForSurface, isCreatorMode } from "../creator-modes";
import type { CreatorMode, Surface } from "../catalog/types";
import { browserStorage } from "./browser-storage";

/** Results one press of Generate produces. Models that do not carry a count of
    their own are submitted once per result — every unit is a real platform
    request — so the ceiling is deliberately small. */
export const MAX_BATCH = 4;

type ActiveState = {
  surface: Surface;
  creatorMode: CreatorMode;
  model: string;
  batch: number;
  setModel: (id: string) => void;
  setCreatorMode: (mode: CreatorMode) => void;
  setBatch: (count: number) => void;
};

export const useActive = create<ActiveState>()(
  persist(
    (set) => ({
      surface: "video",
      creatorMode: "video",
      model: "gemini-omni-1.1-flash-preview",
      batch: 1,
      setModel: (id) => {
        const model = getModel(id);
        set((state) => {
          const creatorMode = CREATOR_SURFACES[state.creatorMode] === model.surface
            ? state.creatorMode
            : creatorForSurface(model.surface);
          return state.model === model.id && state.surface === model.surface && state.creatorMode === creatorMode
            ? state
            : { model: model.id, surface: model.surface, creatorMode };
        });
      },
      setCreatorMode: (creatorMode) => {
        const model = getModel(CREATOR_DEFAULT_MODELS[creatorMode]);
        set({ creatorMode, model: model.id, surface: model.surface });
      },
      setBatch: (count) =>
        set((state) => {
          const batch = Math.min(MAX_BATCH, Math.max(1, Math.round(count)));
          return state.batch === batch ? state : { batch };
        }),
    }),
    {
      name: "openhiggsfield.active.v3",
      storage: browserStorage(),
      partialize: (state) => ({ surface: state.surface, creatorMode: state.creatorMode, model: state.model, batch: state.batch }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!isCreatorMode(state.creatorMode)) state.creatorMode = creatorForSurface(state.surface);
        if (state.creatorMode === "landing" && state.model === "gemini-omni-1.1-flash-preview") {
          state.setCreatorMode("landing");
          return;
        }
        try {
          getModel(state.model);
        } catch {
          state.setModel("gemini-omni-1.1-flash-preview");
        }
      },
    },
  ),
);
