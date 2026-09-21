/**
 * A paid Google generation request can take several minutes before it returns
 * the durable interaction/operation id. Keep the client connection alive long
 * enough to receive that id instead of abandoning a generation that may
 * already be running at the provider.
 */
export const GOOGLE_MEDIA_REQUEST_TIMEOUT_MS = 10 * 60_000;
