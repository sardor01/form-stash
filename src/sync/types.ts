export interface SyncConfig {
  enabled: boolean
  workerUrl: string
  googleClientId: string
  /** Google sub of the signed-in user; cleared on sign-out. */
  googleSub: string | null
  /** Display email, populated after a successful sign-in. */
  googleEmail: string | null
  /** Last successful pull timestamp (ms). */
  lastPullAt: number | null
  /** Last successful push timestamp (ms). */
  lastPushAt: number | null
  lastStatus: 'idle' | 'syncing' | 'ok' | 'error' | 'needs-passphrase' | 'needs-signin'
  lastError: string | null
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  workerUrl: '',
  googleClientId: '',
  googleSub: null,
  googleEmail: null,
  lastPullAt: null,
  lastPushAt: null,
  lastStatus: 'idle',
  lastError: null,
}

/** A short-lived authenticated session, held in chrome.storage.session. */
export interface SyncSession {
  /** Raw bytes of the AES-GCM 256 key, base64-encoded. */
  keyB64: string
  /** Salt that produced the key (lets us re-derive after restart). */
  saltB64: string
  /** Google id_token JWT. */
  idToken: string
  /** Expiry of the id_token (seconds since epoch). */
  idTokenExp: number
}

export type SyncBucket = 'projects' | 'forms' | 'presets'
export const SYNC_BUCKETS: readonly SyncBucket[] = [
  'projects',
  'forms',
  'presets',
]

export interface StoredBlob {
  ciphertext: string
  iv: string
  version: number
  updatedAt: number
}

export interface SyncIndex {
  buckets: Record<SyncBucket, { version: number, updatedAt: number } | null>
}
