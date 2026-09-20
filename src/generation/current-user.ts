import "server-only";

import { headers } from "next/headers";

/** The local build deliberately refuses non-loopback requests. */
export async function currentUserId(): Promise<string> {
  const requestHeaders = await headers();
  const rawHost = requestHeaders.get("host") || "";
  let host = "";
  try {
    host = new URL(`http://${rawHost}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    throw new Error("OpenHiggsfield requires a valid local host");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("OpenHiggsfield is configured for local access only");
  }
  return "local-user";
}
