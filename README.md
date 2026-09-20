# OpenHiggsfield AI — private Google media studio

This fork runs as a private OpenAI Site and supports only:

- Nano Banana 2 (`gemini-3.1-flash-image`)
- Nano Banana Pro (`gemini-3-pro-image`)
- Omni 1.1 Flash (`gemini-omni-1.1-flash-preview`)
- Veo 3.1 (`veo-3.1-generate-001`)

The Google Cloud project ID and API key are entered in the studio modal and
stored in a Secure, HttpOnly, SameSite=Strict cookie. They are read only by
server actions and are not written to the repository, D1, R2, logs, or browser
JavaScript. Generation usage is sent to the project entered in the modal.

Generation jobs and media are stored in Sites R2 under a per-user namespace.
Usage sessions are stored in Sites D1 and queried by the authenticated OpenAI
user id. The `/costs` page groups estimated spend by São Paulo date and lets the
owner inspect or delete each session and its stored result.

Cost figures are estimates based on model usage returned by Google, the pricing
snapshot embedded in `src/generation/pricing.ts`, and the latest available PTAX
sell rate. They are not a Google Cloud invoice. Veo is billed by generated
seconds and therefore reports zero tokens plus its billable seconds.

## Local development

Use Node 22.13 or newer:

```bash
pnpm install
pnpm db:generate
pnpm dev
```

Apply `drizzle/*.sql` to the local D1 binding before opening `/costs`. Production
migrations are packaged with each Sites version.

## Validation

```bash
pnpm audit
pnpm peers check
pnpm exec tsc --noEmit
pnpm build
```
