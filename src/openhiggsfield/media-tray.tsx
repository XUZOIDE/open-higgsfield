"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { MediaItem, MediaRole, ModelEntry } from "@/generation/catalog";
import { useImageMedia, useVideoMedia } from "@/generation/stores/media";
import { uploadMedia } from "@/generation/upload";

import { ROLE_ACCEPT, ROLE_LABELS, ROLE_TAGS, rolesOf } from "./data";
import { AudioIcon, CloseIcon, VideoIcon } from "./icons";
import { kindOfFile, loadUploads, mergeUploads, rememberUpload, saveUploads, type UploadRecord } from "./uploads";

function useMedia(model: ModelEntry) {
  const imageMedia = useImageMedia();
  const videoMedia = useVideoMedia();
  return model.surface === "image" ? imageMedia : videoMedia;
}

export interface MediaTray {
  roles: MediaRole[];
  /** The current surface's attachments, so the picker can derive its own caps
      from the same list the strip below renders. */
  items: MediaItem[];
  /** Every file this browser has sent to Blob, newest first. */
  uploads: UploadRecord[];
  /** The last upload batch. It goes onto the shelf and into the panel's
      selection, not onto the plane — the panel stages the whole set and one
      press applies it. */
  staged: { id: string; urls: string[] } | null;
  uploading: boolean;
  /** Hidden file input; render it once inside the composer. */
  input: ReactNode;
  /** Set the role the next file takes, then open the OS picker. */
  begin: (role: MediaRole) => void;
  /** Make the role's inputs exactly these URLs — the picker hands back the set
      it edited, so one press both attaches and detaches. */
  apply: (role: MediaRole, urls: string[]) => void;
}

export function useMediaTray(
  model: ModelEntry,
  onError: (message: string | null) => void,
): MediaTray {
  const media = useMedia(model);
  const [uploading, setUploading] = useState(false);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [staged, setStaged] = useState<{ id: string; urls: string[] } | null>(null);
  const [uploadsLoaded, setUploadsLoaded] = useState(false);
  const roleRef = useRef<MediaRole>("reference");
  const inputRef = useRef<HTMLInputElement>(null);

  /* Read once, then write back on every change — the same order history takes,
     and for the same reason: writing before the read has landed would persist
     the empty initial value over the stored shelf. */
  useEffect(() => {
    let live = true;
    void loadUploads()
      .then((rows) => {
        if (!live) return;
        setUploads((current) => mergeUploads(rows, current));
        setUploadsLoaded(true);
      })
      .catch(() => {
        if (live) setUploadsLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (uploadsLoaded) void saveUploads(uploads);
  }, [uploadsLoaded, uploads]);

  const roles = rolesOf(model);
  async function onFiles(files: File[]) {
    if (files.length === 0) return;
    onError(null);
    setUploading(true);
    const urls: string[] = [];
    try {
      for (const file of files) {
        const uploaded = await uploadMedia(file);
        urls.push(uploaded.url);
        /* The file outlives this run: it joins the shelf the picker offers, so
           a reference used once can be reached again without a second upload. */
        setUploads((prev) =>
          rememberUpload(prev, {
            id: crypto.randomUUID(),
            url: uploaded.url,
            kind: kindOfFile(file),
            name: file.name,
            createdAt: Date.now(),
          }),
        );
      }
    } catch (caught) {
      onError(
        caught instanceof Error
          ? `Upload failed — ${caught.message}.`
          : "Upload failed. Retry, or drop the file and generate from the prompt alone.",
      );
    } finally {
      /* A later file can fail after earlier files have reached local storage.
         Keep those successful uploads selected instead of making the visitor
         hunt for them on the shelf. */
      if (urls.length > 0) setStaged({ id: crypto.randomUUID(), urls });
      setUploading(false);
    }
  }

  /* accept is set on the element rather than through state: the picker opens in
     the same tick as the choice, before React could re-render it. */
  function begin(role: MediaRole) {
    const element = inputRef.current;
    if (!element) return;
    roleRef.current = role;
    element.accept = ROLE_ACCEPT[role];
    element.multiple = (model.roles[role] ?? 0) > 1;
    element.click();
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      hidden
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        void onFiles(files);
      }}
    />
  );

  /* A replace, not an append: the panel edits one role's whole set, so what it
     hands back decides both what arrives and what leaves. Rows whose URL
     survives keep their id, and with it their place in the strip. */
  function apply(role: MediaRole, urls: string[]) {
    const keep = new Set(urls);
    const held = new Set<string>();
    for (const item of media.items) {
      if (item.role !== role) continue;
      if (keep.has(item.url)) held.add(item.url);
      else media.remove(item.id);
    }
    for (const url of urls) {
      if (!held.has(url)) media.add({ id: crypto.randomUUID(), url, role });
    }
  }

  return { roles, items: media.items, uploads, staged, uploading, input, begin, apply };
}

/** Attached inputs, above the prompt — the frames read before the words do. */
export function MediaStrip({ model }: { model: ModelEntry }) {
  const media = useMedia(model);
  const items = media.items.filter((item) => model.roles[item.role]);
  if (items.length === 0) return null;

  return (
    <ul className="ohf-strip">
      {items.map((item) => (
        <li key={item.id} className="ohf-strip-item">
          <span className="ohf-strip-tile">
            {item.role === "audio" || item.role === "video" ? (
              <span className="ohf-strip-glyph">
                {item.role === "audio" ? <AudioIcon size={20} /> : <VideoIcon size={20} />}
              </span>
            ) : (
              /* Blob-hosted user upload; next/image would proxy an arbitrary
                 remote host for a 56px thumb. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                className="ohf-strip-thumb"
                src={item.url}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.visibility = "hidden";
                }}
              />
            )}
            <span className="ohf-strip-tag">{ROLE_TAGS[item.role]}</span>
          </span>
          <button
            type="button"
            className="ohf-strip-remove"
            aria-label={`Remove ${ROLE_LABELS[item.role].toLowerCase()}`}
            onClick={() => media.remove(item.id)}
          >
            <CloseIcon size={10} />
          </button>
        </li>
      ))}
    </ul>
  );
}
