# Form Stash

A Chrome (MV3) extension that captures the filled state of a form and replays
it later. Built for testing forms in modern SPAs (React, Vue, Ark UI, Radix,
shadcn). Optional end-to-end-encrypted Cloudflare KV sync keeps presets in
step across multiple browser profiles.

See [form-prefill-extension-spec.md](form-prefill-extension-spec.md) for the
full feature spec.

## Repository layout

```
entrypoints/      WXT entrypoints — background, content, sidepanel
src/
  shared/         Types, zod storage helpers, messaging
  content/        Snapshot, fill engine, submit detection, save modal
  sidepanel/      App + tree + managers + sync UI
  sync/           OAuth, AES-GCM crypto, sync engine
  ui/             Shared SaveForm + helpers
worker/           Cloudflare Worker that fronts the KV namespace
```

## Build the extension

```bash
pnpm install
pnpm build                # production bundle → .output/chrome-mv3
pnpm dev                  # HMR + auto-loaded Chrome profile
```

Load `.output/chrome-mv3` via `chrome://extensions` → **Load unpacked**.

## Cloud sync — one-time setup

Sync is **opt-in**. Without it the extension works entirely from
`chrome.storage.local`. To enable sync you wire up three things:
a Google OAuth client (identifies you), the Cloudflare Worker
(holds the encrypted blobs in KV), and an encryption passphrase
(derives the AES key — the server never sees it).

### 1. Pin the extension ID (needed for the OAuth redirect URI)

OAuth redirect URIs in Google must point at
`https://<extension-id>.chromiumapp.org/`. Chrome assigns an unpacked
extension a random ID by default, which changes between machines. Pin it
by adding a public `key` to the manifest (one-time):

```bash
# Generate a key + the matching extension ID
openssl genrsa 2048 | openssl rsa -pubout -outform DER 2>/dev/null \
  | openssl base64 -A
```

Paste the base64 string into `wxt.config.ts` under `manifest.key` and
rebuild. The extension ID is derived deterministically from that key —
the value is shown on `chrome://extensions` after reload.

### 2. Create a Google OAuth client

1. Visit <https://console.cloud.google.com/>, create (or pick) a project.
2. **APIs & Services → OAuth consent screen** — choose External, fill in
   the basics, add yourself as a test user.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Type: **Web application**.
   - Authorized redirect URI: `https://<extension-id>.chromiumapp.org/`
     (the trailing slash matters).
4. Copy the **Client ID** — you'll paste it into the extension settings.

### 3. Deploy the Worker

The Worker reads its KV namespace ID from `worker/.env` so the ID stays out
of source control. Both `worker/.env` and the generated `worker/wrangler.toml`
are gitignored — only `worker/.env.example` and `worker/wrangler.toml.template`
are committed.

```bash
cd worker
pnpm install
pnpm wrangler login                                            # one-time

# Create your own KV namespace (or reuse an existing one) and copy the
# printed id into KV_NAMESPACE_ID in .env.
pnpm wrangler kv namespace create form-stash-sync
cp .env.example .env                                           # then edit .env

pnpm wrangler secret put GOOGLE_CLIENT_ID                      # paste the OAuth Client ID
pnpm deploy                                                    # renders wrangler.toml from template + .env, then deploys
```

The output prints the Worker URL — copy it.

### 4. Configure the extension (per profile)

Open the side panel → **☁️ Cloud sync**:

1. Paste the **Worker URL**.
2. Paste the **Google OAuth Client ID**.
3. Tick **Enable sync**.
4. Click **Sign in with Google**.
5. Enter the **encryption passphrase**. Use the *same* passphrase on
   every profile that should share data — Cloudflare only stores the
   ciphertext; the passphrase is what unlocks it locally.

Sync runs automatically every 5 minutes (via `chrome.alarms`), 2 s after
any local change, and on demand via the **Sync now** button.

### Security model

- The Worker validates Google `id_token`s against Google's JWKS every
  request; only the verified `sub` is used as a partition key in KV.
- The encryption passphrase is derived to an AES-GCM 256 key via PBKDF2
  (200k SHA-256 iterations) with a per-user random salt fetched from the
  Worker. The key lives in `chrome.storage.session` (cleared on browser
  close) and never leaves your devices.
- The Worker never receives plaintext or the passphrase.

### Conflict resolution

Per-record last-writer-wins by `updatedAt`. Deletes are tombstones
(`deletedAt` is set; the record sticks around so the deletion replicates
to other profiles, which then drop it locally).

## Useful commands

```bash
pnpm compile             # tsc --noEmit (extension)
pnpm build               # WXT production build
pnpm dev                 # WXT dev with HMR
pnpm wxt prepare         # regenerate WXT type stubs

pnpm --dir worker dev          # wrangler dev (local Worker)
pnpm --dir worker typecheck    # tsc --noEmit (worker)
pnpm --dir worker deploy       # wrangler deploy
```
