import "server-only";

import { headers } from "next/headers";

/** Stable identity supplied by Sites after ChatGPT sign-in. */
export async function currentUserId(): Promise<string> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  if (userId) return userId;
  if (process.env.NODE_ENV === "development") return "local-preview";
  throw new Error("Authenticated Site access is required");
}
