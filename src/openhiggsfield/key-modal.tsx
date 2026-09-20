"use client";

import { useEffect, useRef, useState } from "react";

import { getPlatformStatus } from "@/generation/actions";

import { CloseIcon } from "./icons";

type GcloudStatus = {
  available: boolean;
  projectId: string | null;
  account: string | null;
  error: string | null;
};

const EMPTY: GcloudStatus = {
  available: false,
  projectId: null,
  account: null,
  error: null,
};

export function KeyModal({ onClose, onStatus }: {
  onClose: () => void;
  onStatus: (ready: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<GcloudStatus>(EMPTY);
  const [busy, setBusy] = useState(true);

  async function refresh() {
    setBusy(true);
    const next = await getPlatformStatus();
    setStatus(next);
    onStatus(next.available);
    setBusy(false);
  }

  useEffect(() => {
    ref.current?.showModal();
    panelRef.current?.focus();
    void refresh();
    // Only load when this modal instance opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="ohf-keys-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div ref={panelRef} tabIndex={-1} className="ohf-dialog-panel ohf-keys-panel">
        <div className="ohf-keys-head">
          <div>
            <div id="ohf-keys-title" className="ohf-keys-title">
              Local Google Cloud access
            </div>
            <p className="ohf-keys-copy">
              The app uses the active gcloud login only while it is running. Access tokens stay on this machine and are refreshed automatically.
            </p>
          </div>
          <button type="button" className="ohf-icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon size={13} />
          </button>
        </div>

        <div className="ohf-keys-form">
          <div className="ohf-field">
            <div className="ohf-field-label">Google Cloud project</div>
            <div className="ohf-input ohf-input--mono" data-readonly>
              {busy ? "Checking…" : status.projectId || "Not configured"}
            </div>
          </div>
          <div className="ohf-field">
            <div className="ohf-field-label">gcloud account</div>
            <div className="ohf-input ohf-input--mono" data-readonly>
              {busy ? "Checking…" : status.account || "Not authenticated"}
            </div>
          </div>

          {status.error && (
            <div className="ohf-alert" role="alert">
              <span className="ohf-alert-text">{status.error}</span>
            </div>
          )}

          <div className="ohf-keys-actions">
            <button type="button" className="ohf-btn-quiet" disabled={busy} onClick={() => void refresh()}>
              {busy ? "Checking…" : "Check again"}
            </button>
            <button type="button" className="ohf-keys-save" disabled={busy || !status.available} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
