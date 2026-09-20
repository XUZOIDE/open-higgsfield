import "server-only";

import { env } from "cloudflare:workers";
import { Buffer as NodeBuffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";

import type { GenerationPlane } from "./catalog/types";
import { getGcloudCredentials } from "./gcloud-auth";
import type { GenerationStatus, QueuedGeneration } from "./platform";
import { imageUsage, omniUsage, veoUsage } from "./pricing";

const VEO_LOCATION = process.env.GOOGLE_MIDIA_VEO_LOCATION || "us-central1";

type Job =
  | { kind: "complete"; status: GenerationStatus }
  | { kind: "omni"; requestId: string; interactionId: string; projectId: string }
  | { kind: "veo"; requestId: string; operationName: string; model: string; duration: number; projectId: string };

export async function submitVertexGeneration(
  plane: GenerationPlane,
  accessToken: string,
  projectId: string,
  userId: string,
  requestId = randomUUID(),
): Promise<QueuedGeneration> {
  if (plane.model === "gemini-3.1-flash-image" || plane.model === "gemini-3-pro-image") {
    const status = await generateImage(requestId, plane, accessToken, projectId, userId);
    await writeJob(userId, requestId, { kind: "complete", status });
  } else if (plane.model === "gemini-omni-1.1-flash-preview") {
    const interactionId = await submitOmni(plane, accessToken, projectId, userId);
    await writeJob(userId, requestId, { kind: "omni", requestId, interactionId, projectId });
  } else if (plane.model === "veo-3.1-generate-001") {
    const operationName = await submitVeo(plane, accessToken, projectId, userId);
    await writeJob(userId, requestId, {
      kind: "veo",
      requestId,
      operationName,
      model: plane.model,
      duration: Number(plane.settings.duration),
      projectId,
    });
  } else {
    throw new Error(`Unsupported Google media model: ${plane.model}`);
  }
  return { status: "queued", requestId, statusUrl: "", cancelUrl: "" };
}

export async function getVertexStatus(
  requestId: string,
  accessToken: string,
  projectId: string,
  userId: string,
): Promise<GenerationStatus> {
  const job = await readJob(userId, requestId);
  if (job.kind === "complete") return job.status;
  if (job.projectId !== projectId) {
    throw new Error(`This generation belongs to Google Cloud project ${job.projectId}. Restore that active gcloud project to continue.`);
  }
  const status = job.kind === "omni" ? await pollOmni(job, accessToken, userId) : await pollVeo(job, accessToken, userId);
  if (status.status === "completed" || status.status === "failed") {
    await writeJob(userId, requestId, { kind: "complete", status });
  }
  return status;
}

export async function saveLocalMedia(userId: string, data: Uint8Array, mimeType: string): Promise<string> {
  const extension = extensionForMime(mimeType);
  const filename = `${randomUUID()}.${extension}`;
  await mediaBucket().put(`users/${userKey(userId)}/media/${filename}`, data, { httpMetadata: { contentType: mimeType } });
  return `/api/media/${filename}`;
}

export async function readLocalMedia(userId: string, filename: string): Promise<{ data: NodeBuffer; mimeType: string }> {
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(filename)) throw new Error("Invalid media name");
  const object = await mediaBucket().get(`users/${userKey(userId)}/media/${filename}`);
  if (!object) throw new Error("Media not found");
  return {
    data: NodeBuffer.from(await object.arrayBuffer()),
    mimeType: object.httpMetadata?.contentType || mimeForExtension(filename.split(".").pop() || ""),
  };
}

async function generateImage(
  requestId: string,
  plane: GenerationPlane,
  accessToken: string,
  projectId: string,
  userId: string,
): Promise<GenerationStatus> {
  const parts: Record<string, unknown>[] = [{ text: plane.prompt.text }];
  for (const item of plane.media.reference ?? []) {
    const media = await mediaFromUrl(item.url, userId);
    parts.push({ inlineData: { mimeType: media.mimeType, data: bytesToBase64(media.data) } });
  }
  const response = await googleJson<Record<string, unknown>>(
    `${globalBase(projectId)}/publishers/google/models/${plane.model}:generateContent`,
    {
      method: "POST",
      body: {
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: String(plane.settings.aspectRatio),
            imageSize: String(plane.settings.resolution),
          },
        },
      },
      timeout: 180_000,
      accessToken,
      projectId,
    },
  );
  const images: Array<{ url: string }> = [];
  for (const part of responseParts(response)) {
    const inline = record(part.inlineData);
    const data = string(inline.data);
    if (!data) continue;
    const mimeType = string(inline.mimeType) || "image/png";
    images.push({ url: await saveLocalMedia(userId, NodeBuffer.from(data, "base64"), mimeType) });
  }
  if (!images.length) throw new Error("Google returned no image output");
  return { status: "completed", requestId, images, usage: await imageUsage(plane.model, response) };
}

async function submitOmni(plane: GenerationPlane, accessToken: string, projectId: string, userId: string): Promise<string> {
  const input: Record<string, unknown>[] = [{ type: "text", text: plane.prompt.text }];
  const first = plane.media.start?.[0];
  if (first) {
    const media = await mediaFromUrl(first.url, userId);
    input.push({ type: "image", mime_type: media.mimeType, data: bytesToBase64(media.data) });
  }
  const response = await googleJson<Record<string, unknown>>(`${globalBase(projectId)}/interactions`, {
    method: "POST",
    body: {
      model: plane.model,
      background: true,
      input,
      response_format: [
        {
          type: "video",
          aspect_ratio: String(plane.settings.aspectRatio),
          resolution: String(plane.settings.resolution),
          duration: `${Number(plane.settings.duration)}s`,
        },
      ],
      generation_config: {
        video_config: { task: first ? "image_to_video" : "text_to_video" },
      },
    },
    timeout: 60_000,
    accessToken,
    projectId,
  });
  const id = string(response.id);
  if (!id) throw new Error("Google returned no interaction id");
  return id;
}

async function pollOmni(job: Extract<Job, { kind: "omni" }>, accessToken: string, userId: string): Promise<GenerationStatus> {
  const response = await googleJson<Record<string, unknown>>(
    `${globalBase(job.projectId)}/interactions/${encodeURIComponent(job.interactionId)}`,
    { method: "GET", timeout: 60_000, accessToken, projectId: job.projectId },
  );
  const providerStatus = string(response.status) || "in_progress";
  if (providerStatus !== "completed") {
    if (["failed", "cancelled", "canceled"].includes(providerStatus)) {
      return { status: "failed", requestId: job.requestId, error: providerError(response) };
    }
    return { status: "processing", requestId: job.requestId };
  }
  const video = findOmniVideo(response);
  if (!video) return { status: "failed", requestId: job.requestId, error: "Google returned no video output" };
  const url = await persistVideo(video, accessToken, job.projectId, userId);
  return {
    status: "completed",
    requestId: job.requestId,
    video: { url },
    usage: await omniUsage(response),
  };
}

async function submitVeo(plane: GenerationPlane, accessToken: string, projectId: string, userId: string): Promise<string> {
  const instance: Record<string, unknown> = { prompt: plane.prompt.text };
  const first = plane.media.start?.[0];
  const last = plane.media.end?.[0];
  if (first) instance.image = await veoImage(first.url, userId);
  if (last) instance.lastFrame = await veoImage(last.url, userId);
  const duration = Number(plane.settings.duration);
  if (![4, 6, 8].includes(duration)) throw new Error("Veo duration must be 4, 6, or 8 seconds");
  const response = await googleJson<Record<string, unknown>>(
    `${veoBase(projectId)}/${plane.model}:predictLongRunning`,
    {
      method: "POST",
      body: {
        instances: [instance],
        parameters: {
          sampleCount: 1,
          aspectRatio: String(plane.settings.aspectRatio),
          resolution: String(plane.settings.resolution),
          durationSeconds: duration,
          generateAudio: true,
        },
      },
      timeout: 60_000,
      accessToken,
      projectId,
    },
  );
  const name = string(response.name);
  if (!name) throw new Error("Google returned no Veo operation name");
  return name;
}

async function pollVeo(job: Extract<Job, { kind: "veo" }>, accessToken: string, userId: string): Promise<GenerationStatus> {
  const response = await googleJson<Record<string, unknown>>(
    `${veoBase(job.projectId)}/${job.model}:fetchPredictOperation`,
    { method: "POST", body: { operationName: job.operationName }, timeout: 60_000, accessToken, projectId: job.projectId },
  );
  if (response.done !== true) return { status: "processing", requestId: job.requestId };
  if (response.error) {
    return { status: "failed", requestId: job.requestId, error: providerError(response) };
  }
  const videos = record(response.response).videos;
  const first = Array.isArray(videos) ? record(videos[0]) : {};
  const bytes = string(first.bytesBase64Encoded);
  const gcsUri = string(first.gcsUri);
  if (!bytes && !gcsUri) {
    return { status: "failed", requestId: job.requestId, error: "Google returned no Veo video output" };
  }
  const url = bytes
    ? await saveLocalMedia(userId, NodeBuffer.from(bytes, "base64"), string(first.mimeType) || "video/mp4")
    : await saveLocalMedia(userId, await downloadGcs(gcsUri!, accessToken, job.projectId), string(first.mimeType) || "video/mp4");
  return {
    status: "completed",
    requestId: job.requestId,
    video: { url },
    usage: await veoUsage(job.duration),
  };
}

async function veoImage(url: string, userId: string) {
  const media = await mediaFromUrl(url, userId);
  return { bytesBase64Encoded: bytesToBase64(media.data), mimeType: media.mimeType };
}

async function mediaFromUrl(url: string, userId: string): Promise<{ data: NodeBuffer; mimeType: string }> {
  if (url.startsWith("/api/media/")) return readLocalMedia(userId, url.slice("/api/media/".length));
  throw new Error("Input media must be uploaded to this local app");
}

async function persistVideo(video: Record<string, unknown>, accessToken: string, projectId: string, userId: string): Promise<string> {
  const mimeType = string(video.mime_type) || string(video.mimeType) || "video/mp4";
  const data = string(video.data);
  if (data) return saveLocalMedia(userId, NodeBuffer.from(data, "base64"), mimeType);
  const uri = string(video.uri);
  if (!uri) throw new Error("Video output has neither data nor URI");
  const bytes = uri.startsWith("gs://")
    ? await downloadGcs(uri, accessToken, projectId)
    : await downloadApprovedGoogleVideo(uri);
  return saveLocalMedia(userId, bytes, mimeType);
}

async function downloadApprovedGoogleVideo(uri: string): Promise<NodeBuffer> {
  const parsed = new URL(uri);
  const allowed =
    parsed.protocol === "https:" &&
    (parsed.hostname === "storage.googleapis.com" || parsed.hostname.endsWith(".googleusercontent.com"));
  if (!allowed) throw new Error("Google returned an untrusted video URL");
  const response = await fetch(parsed, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Could not download generated video (${response.status})`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 300 * 1024 * 1024) throw new Error("Generated video exceeds 300 MB");
  const bytes = NodeBuffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 300 * 1024 * 1024) throw new Error("Generated video exceeds 300 MB");
  return bytes;
}

async function downloadGcs(uri: string, accessToken: string, projectId: string): Promise<NodeBuffer> {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error("Invalid Cloud Storage URI");
  const url = `https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(match[1]!)}/o/${encodeURIComponent(match[2]!)}?alt=media`;
  const response = await authenticatedFetch(url, {
    method: "GET",
    headers: { "x-goog-user-project": projectId },
    signal: AbortSignal.timeout(180_000),
  }, accessToken, projectId);
  if (!response.ok) throw new Error(`Could not download generated video (${response.status})`);
  return NodeBuffer.from(await response.arrayBuffer());
}

function findOmniVideo(response: Record<string, unknown>): Record<string, unknown> | null {
  for (const step of Array.isArray(response.steps) ? response.steps : []) {
    for (const content of Array.isArray(record(step).content) ? (record(step).content as unknown[]) : []) {
      const item = record(content);
      if (item.type === "video") return item;
    }
  }
  return null;
}

function responseParts(response: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const candidate of Array.isArray(response.candidates) ? response.candidates : []) {
    const parts = record(record(candidate).content).parts;
    if (Array.isArray(parts)) out.push(...parts.map(record));
  }
  return out;
}

async function googleJson<T>(
  url: string,
  options: {
    method: "GET" | "POST";
    body?: Record<string, unknown>;
    timeout: number;
    accessToken: string;
    projectId: string;
  },
): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: options.method,
    headers: {
      "x-goog-user-project": options.projectId,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(options.timeout),
  }, options.accessToken, options.projectId);
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text;
  }
  if (!response.ok) throw new Error(googleError(response.status, payload));
  return payload as T;
}

async function authenticatedFetch(
  url: string,
  init: RequestInit,
  accessToken: string,
  projectId: string,
): Promise<Response> {
  const request = (token: string) => fetch(url, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init.headers).entries()), Authorization: `Bearer ${token}` },
  });
  let response = await request(accessToken);
  if (response.status !== 401) return response;

  const refreshed = await getGcloudCredentials(true);
  if (refreshed.projectId !== projectId) {
    throw new Error(`The active Google Cloud project changed from ${projectId} to ${refreshed.projectId} during this run`);
  }
  response = await request(refreshed.accessToken);
  return response;
}

function globalBase(projectId: string): string {
  return `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global`;
}

function veoBase(projectId: string): string {
  return `https://${VEO_LOCATION}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${VEO_LOCATION}/publishers/google/models`;
}

async function writeJob(userId: string, requestId: string, job: Job): Promise<void> {
  await mediaBucket().put(`users/${userKey(userId)}/jobs/${requestId}.json`, JSON.stringify(job), {
    httpMetadata: { contentType: "application/json" },
  });
}

async function readJob(userId: string, requestId: string): Promise<Job> {
  if (!/^[a-f0-9-]+$/i.test(requestId)) throw new Error("Invalid request id");
  try {
    const object = await mediaBucket().get(`users/${userKey(userId)}/jobs/${requestId}.json`);
    if (!object) throw new Error("missing");
    return JSON.parse(await object.text()) as Job;
  } catch {
    throw new Error("Generation job was not found on this machine");
  }
}

function userKey(userId: string): string {
  if (!userId) throw new Error("Missing authenticated user");
  return createHash("sha256").update(userId).digest("hex");
}

function bytesToBase64(data: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function mediaBucket(): R2Bucket {
  if (!env.MEDIA) throw new Error("Local media storage is unavailable");
  return env.MEDIA;
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("quicktime")) return "mov";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.startsWith("video/")) return "mp4";
  if (mimeType.startsWith("audio/")) return "wav";
  return "png";
}

function mimeForExtension(extension: string): string {
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    wav: "audio/wav",
  };
  return types[extension.toLowerCase()] || "application/octet-stream";
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function providerError(payload: Record<string, unknown>): string {
  const error = record(payload.error);
  return string(error.message) || string(payload.status) || "Google media generation failed";
}

function googleError(status: number, payload: unknown): string {
  const error = record(record(payload).error);
  return string(error.message) || `Google API request failed (${status})`;
}
