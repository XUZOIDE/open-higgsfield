"use server";

import { randomUUID } from "node:crypto";

import { currentUserId } from "./current-user";
import { getModel, parseSettings } from "./catalog";
import type { GenerationPlane } from "./catalog/types";
import {
  getGcloudCredentials,
  getGcloudStatus,
  saveMediaBatchWithFinder,
  saveMediaWithFinder,
} from "./gcloud-auth";
import type { GenerationStatus, StatusResult } from "./platform";
import {
  createCostSession,
  listOpenCostSessions,
  type OpenCostSession,
  updateCostSession,
} from "./session-store";
import { getVertexStatus, submitVertexGeneration } from "./vertex";

export async function hasPlatformCredentials() {
  return (await getGcloudStatus()).available;
}

export async function getPlatformStatus() {
  return getGcloudStatus();
}

export async function saveGeneratedMedia(data: unknown) {
  await currentUserId();
  const file = parseSaveFile(data);
  return saveMediaWithFinder(file.sourcePath, file.name);
}

export async function saveGeneratedMediaBatch(data: unknown) {
  await currentUserId();
  if (!Array.isArray(data) || data.length === 0 || data.length > 100) throw new Error("Invalid file selection");
  return saveMediaBatchWithFinder(data.map(parseSaveFile));
}

export async function submitGeneration(plane: GenerationPlane) {
  const model = getModel(plane.model);
  const parsed: GenerationPlane = {
    ...plane,
    settings: parseSettings(model, plane.settings),
  };
  const userId = await currentUserId();
  const requestId = randomUUID();
  await createCostSession(userId, parsed, requestId, model.label);
  try {
    const credentials = await getGcloudCredentials();
    return {
      ok: true as const,
      queued: await submitVertexGeneration(parsed, credentials.accessToken, credentials.projectId, userId, requestId),
    };
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    await updateCostSession(userId, {
      status: "failed",
      requestId,
      error,
    });
    /* Returning provider failures as data keeps production React from replacing
       the useful message with its generic minified server-action error. */
    return { ok: false as const, error };
  }
}

/** Every request in flight, answered in one round trip. Next dispatches server
    actions one at a time per client, so a poll per run would queue ahead of the
    next submit — the fan-out belongs on this side of the call, where it is
    genuinely parallel. */
export async function getGenerationStatuses(data: unknown): Promise<StatusResult[]> {
  const requestIds = parseRequestIds(data);
  const credentials = await getGcloudCredentials();
  const userId = await currentUserId();
  return Promise.all(
    requestIds.map(async (requestId): Promise<StatusResult> => {
      try {
        const status = await getVertexStatus(requestId, credentials.accessToken, credentials.projectId, userId);
        if (status.status === "completed" || status.status === "failed") {
          await updateCostSession(userId, status);
        }
        return { requestId, status };
      } catch (caught) {
        return { requestId, error: caught instanceof Error ? caught.message : String(caught) };
      }
    }),
  );
}

export type OpenGenerationResult =
  | { session: OpenCostSession; status: GenerationStatus }
  | { session: OpenCostSession; discarded: true }
  | { session: OpenCostSession; error: string };

export async function recoverOpenGenerations(): Promise<OpenGenerationResult[]> {
  const userId = await currentUserId();
  const sessions = await listOpenCostSessions(userId);
  if (sessions.length === 0) return [];
  const credentials = await getGcloudCredentials();
  return Promise.all(
    sessions.map(async (session): Promise<OpenGenerationResult> => {
      try {
        const status = await getVertexStatus(
          session.requestId,
          credentials.accessToken,
          credentials.projectId,
          userId,
        );
        if (status.status === "completed" || status.status === "failed") {
          await updateCostSession(userId, status);
        }
        return { session, status };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        if (message === "Generation job was not found on this machine") {
          await updateCostSession(userId, {
            status: "failed",
            requestId: session.requestId,
            error: message,
          });
          return { session, discarded: true };
        }
        return { session, error: message };
      }
    }),
  );
}

function parseRequestIds(data: unknown): string[] {
  const payload = asObject(data, "Invalid status payload");
  const requestIds = payload.requestIds;
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    throw new Error("Invalid request ids");
  }
  return requestIds.map((requestId) => {
    if (typeof requestId !== "string" || !requestId) throw new Error("Invalid request id");
    return requestId;
  });
}

function asObject(data: unknown, message: string): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error(message);
  return data as Record<string, unknown>;
}

function parseSaveFile(data: unknown) {
  const payload = asObject(data, "Invalid file");
  const sourcePath = payload.sourcePath;
  const name = payload.name;
  if (typeof sourcePath !== "string" || !/^\/api\/media\/[a-f0-9-]+\.[a-z0-9]+$/i.test(sourcePath)) {
    throw new Error("Invalid local media path");
  }
  if (typeof name !== "string" || !name || name.length > 180 || /[\x00/\\:]/.test(name)) {
    throw new Error("Invalid file name");
  }
  return { sourcePath, name };
}
