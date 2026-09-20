# OpenHiggsfield AI — local Google media studio

This fork runs only on `127.0.0.1` and supports:

- Nano Banana 2 (`gemini-3.1-flash-image`)
- Nano Banana Pro (`gemini-3-pro-image`)
- Omni 1.1 Flash (`gemini-omni-1.1-flash-preview`)
- Veo 3.1 (`veo-3.1-generate-001`)

It uses the Google account and project already selected in the local `gcloud`
CLI. A loopback-only bridge obtains short-lived OAuth tokens, refreshes them
after expiry, and never sends them to browser JavaScript. Closing the local app
stops the bridge and discards its in-memory token cache.

Generation jobs, media and cost sessions are stored only on this computer in
the ignored `.wrangler/state` directory. Browser gallery metadata is kept in
IndexedDB. The `/costs` page groups estimated spend by São Paulo date and lets
you inspect or delete each session and its stored result.

Individual media uploads can be up to 50 MB.

Cost figures are estimates based on model usage returned by Google, the pricing
snapshot in `src/generation/pricing.ts`, and the latest available PTAX sell
rate. They are not a Google Cloud invoice. Veo is billed by generated seconds
and therefore reports zero tokens plus its billable seconds.

## Run locally

Use Node 22.13 or newer, pnpm, and the Google Cloud CLI:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
pnpm install
pnpm dev
```

Open <http://127.0.0.1:5173>. The Google button in the top bar shows the active
account and project. To switch billing projects, stop the app, run
`gcloud config set project OTHER_PROJECT_ID`, and start it again.

The first time you save one result, Chrome opens the native macOS Finder save
sheet. Saving a multi-selection opens one Finder folder chooser and writes the
selected files there.

## Production-style local run

```bash
pnpm start
```

`pnpm start` rebuilds the app before starting the local server so the server
bundle and its CSS/JavaScript assets always stay in sync.

## Validation

```bash
pnpm audit
pnpm exec tsc --noEmit
pnpm build
```
