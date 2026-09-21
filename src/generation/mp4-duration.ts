/** Read an MP4 movie header without invoking a native media tool. The Omni
 * edit contract compares the uploaded clip duration with response_format, so
 * this value must come from the actual file rather than a UI default. */
export function mp4DurationSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const moov = findBox(view, 0, view.byteLength, "moov");
  if (!moov) return null;
  const mvhd = findBox(view, moov.payloadStart, moov.end, "mvhd");
  if (!mvhd) return null;

  const start = mvhd.payloadStart;
  if (start + 20 > mvhd.end) return null;
  const version = view.getUint8(start);
  let timescale: number;
  let duration: number;
  if (version === 0) {
    timescale = view.getUint32(start + 12);
    duration = view.getUint32(start + 16);
  } else if (version === 1) {
    if (start + 32 > mvhd.end) return null;
    timescale = view.getUint32(start + 20);
    const raw = view.getBigUint64(start + 24);
    if (raw > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    duration = Number(raw);
  } else {
    return null;
  }
  if (!timescale || !duration) return null;
  const seconds = duration / timescale;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function omniEditedDuration(sourceSeconds: number, configuredSeconds: number): number {
  if (!Number.isFinite(sourceSeconds) || sourceSeconds <= 0) return configuredSeconds;
  /* This is the comparison rule surfaced by the Interactions API itself. */
  return Math.round(sourceSeconds * 10) / 10;
}

type Box = { payloadStart: number; end: number };

function findBox(view: DataView, start: number, end: number, wanted: string): Box | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = view.getUint32(offset);
    const type = fourCc(view, offset + 4);
    let header = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > end) return null;
      const large = view.getBigUint64(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(large);
      header = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) return null;
    if (type === wanted) return { payloadStart: offset + header, end: offset + size };
    offset += size;
  }
  return null;
}

function fourCc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}
