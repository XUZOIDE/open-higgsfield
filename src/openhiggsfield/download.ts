import type { RunRecord } from "./history";
import { saveGeneratedMedia, saveGeneratedMediaBatch } from "@/generation/actions";

type WritableFile = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
};

type FileHandle = { createWritable(): Promise<WritableFile> };
type DirectoryHandle = { getFileHandle(name: string, options: { create: true }): Promise<FileHandle> };

type PickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileHandle>;
  showDirectoryPicker?: (options?: { mode: "readwrite" }) => Promise<DirectoryHandle>;
};

/* Local results use the macOS save panel through the loopback bridge. The web
   picker and an ordinary download remain as fallbacks for imported URLs. */
export async function saveFile(url: string, name: string): Promise<boolean> {
  if (url.startsWith("/api/media/")) {
    try {
      const result = await saveGeneratedMedia({ sourcePath: url, name });
      return result.saved || result.cancelled;
    } catch {
      // Fall through to the browser picker when the local bridge is unavailable.
    }
  }

  const picker = (window as PickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      /* Open the native dialog before any await that would consume the click's
         user activation. Chrome maps this picker to the macOS Finder sheet. */
      const handle = await picker({ suggestedName: name });
      const blob = await fetchBlob(url);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return true;
      return false;
    }
  }

  try {
    const href = URL.createObjectURL(await fetchBlob(url));
    const link = document.createElement("a");
    link.href = href;
    link.download = name;
    link.click();
    /* Revoking on the next tick races Safari, which reads the blob after the
       click returns. The handle costs nothing until then. */
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
    return true;
  } catch {
    return false;
  }
}

/** A multi-selection asks for one Finder folder, then writes every selected
    result there. Opening several save dialogs after one click is blocked by
    browsers once the first asynchronous write consumes user activation. */
export async function saveFilesToFolder(files: Array<{ url: string; name: string }>): Promise<number> {
  if (files.every((file) => file.url.startsWith("/api/media/"))) {
    try {
      const result = await saveGeneratedMediaBatch(files.map((file) => ({
        sourcePath: file.url,
        name: file.name,
      })));
      return result.cancelled ? 0 : result.failed;
    } catch {
      // Fall through to the browser picker when the local bridge is unavailable.
    }
  }

  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) {
    let failed = 0;
    for (const file of files) if (!(await saveFile(file.url, file.name))) failed++;
    return failed;
  }

  let directory: DirectoryHandle;
  try {
    directory = await picker({ mode: "readwrite" });
  } catch (caught) {
    return caught instanceof DOMException && caught.name === "AbortError" ? 0 : files.length;
  }

  let failed = 0;
  for (const file of files) {
    try {
      const handle = await directory.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(await fetchBlob(file.url));
      await writable.close();
    } catch {
      failed++;
    }
  }
  return failed;
}

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`Could not read media (${response.status})`);
  return response.blob();
}

/** A saved run has to be findable in a downloads folder six months later, so
    the name carries the prompt rather than the platform's request id. */
export function fileNameFor(record: RunRecord, index: number): string {
  const url = record.urls[0] ?? "";
  const ext = /\.([a-z0-9]{2,4})(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  const slug =
    record.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 44)
      .replace(/-+$/, "") || "run";
  const fallback = record.kind === "video" ? "mp4" : record.kind === "html" ? "html" : "png";
  return `openhiggsfield-${slug}-${index + 1}.${ext ?? fallback}`;
}
