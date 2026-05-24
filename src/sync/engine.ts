import type {
  FormDef,
  Preset,
  Project,
} from '../shared/types'
import type { SyncBucket, SyncSession } from './types'
import {
  listRawForms,
  listRawPresets,
  listRawProjects,
  saveForms,
  savePresets,
  saveProjects,
} from '../shared/storage'
import { WorkerClient } from './client'
import {
  clearSyncSession,
  getSyncConfig,
  getSyncSession,
  patchSyncConfig,
  saveSyncSession,
} from './config'
import {
  decryptJson,
  deriveKeyFromPassphrase,
  encryptJson,
  exportKey,
  importKeyFromB64,
} from './crypto'
import { signInWithGoogle } from './oauth'

interface Identified { id: string, updatedAt: number }

interface BucketShape {
  projects: Project[]
  forms: FormDef[]
  presets: Preset[]
}

let runningPromise: Promise<SyncResult> | null = null

export interface SyncResult {
  ok: boolean
  reason?: string
  pulled: Partial<Record<SyncBucket, number>>
  pushed: Partial<Record<SyncBucket, number>>
}

/** Public entry point: runs at most one sync at a time. */
export async function runSync(): Promise<SyncResult> {
  if (runningPromise)
    return runningPromise
  runningPromise = runSyncInner().finally(() => {
    runningPromise = null
  })
  return runningPromise
}

async function runSyncInner(): Promise<SyncResult> {
  const config = await getSyncConfig()
  if (!config.enabled)
    return idle('sync disabled')

  await patchSyncConfig({ lastStatus: 'syncing', lastError: null })

  let session = await getSyncSession()

  try {
    session = await ensureValidSession(session, config.googleClientId)
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await patchSyncConfig({
      lastStatus: 'needs-signin',
      lastError: message,
    })
    return { ok: false, reason: message, pulled: {}, pushed: {} }
  }

  if (!session?.keyB64) {
    await patchSyncConfig({
      lastStatus: 'needs-passphrase',
      lastError: 'set the encryption passphrase to enable sync',
    })
    return {
      ok: false,
      reason: 'passphrase required',
      pulled: {},
      pushed: {},
    }
  }

  const client = new WorkerClient(config.workerUrl, session.idToken)
  const key = await importKeyFromB64(session.keyB64)
  const pulled: Partial<Record<SyncBucket, number>> = {}
  const pushed: Partial<Record<SyncBucket, number>> = {}

  try {
    const local: BucketShape = await loadLocal()
    const remote = await pullRemote(client, key)

    const merged: BucketShape = {
      projects: mergeById(local.projects, remote.projects),
      forms: mergeById(local.forms, remote.forms),
      presets: mergeById(local.presets, remote.presets),
    }

    if (!sameAsLocal(local, merged)) {
      await writeLocal(merged)
    }
    pulled.projects = remote.projects.length
    pulled.forms = remote.forms.length
    pulled.presets = remote.presets.length

    const index = await client.getIndex()
    for (const bucket of ['projects', 'forms', 'presets'] as const) {
      const remoteEntry = index.buckets[bucket]
      const localPayload = (merged as Record<SyncBucket, Identified[]>)[
        bucket
      ]
      if (
        !remoteEntry
        || differsFromRemoteBucket(localPayload, remote[bucket])
      ) {
        const nextVersion = (remoteEntry?.version ?? 0) + 1
        const payload = await encryptJson(key, localPayload)
        const result = await client.putBucket(bucket, {
          ...payload,
          version: nextVersion,
          updatedAt: Date.now(),
          expectedVersion: remoteEntry?.version,
        })
        if (result.accepted) {
          pushed[bucket] = localPayload.length
        }
      }
    }

    await patchSyncConfig({
      lastStatus: 'ok',
      lastError: null,
      lastPullAt: Date.now(),
      lastPushAt: Object.keys(pushed).length ? Date.now() : undefined,
    })
    return { ok: true, pulled, pushed }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await patchSyncConfig({ lastStatus: 'error', lastError: message })
    return { ok: false, reason: message, pulled, pushed }
  }
}

function differsFromRemoteBucket(
  local: Identified[],
  remote: Identified[],
): boolean {
  if (local.length !== remote.length)
    return true
  const remoteMap = new Map(remote.map(r => [r.id, r]))
  for (const l of local) {
    const r = remoteMap.get(l.id)
    if (!r)
      return true
    if (JSON.stringify(l) !== JSON.stringify(r))
      return true
  }
  return false
}

async function ensureValidSession(
  session: SyncSession | null,
  clientId: string,
): Promise<SyncSession> {
  const now = Math.floor(Date.now() / 1000)
  if (session?.idToken && session.idTokenExp - 60 > now)
    return session
  if (!clientId)
    throw new Error('Google OAuth client ID is not configured')
  const result = await signInWithGoogle(clientId, false).catch(async () => {
    throw new Error('Google session expired — sign in again')
  })
  const next: SyncSession = {
    idToken: result.idToken,
    idTokenExp: result.exp,
    keyB64: session?.keyB64 ?? '',
    saltB64: session?.saltB64 ?? '',
  }
  await saveSyncSession(next)
  return next
}

async function pullRemote(
  client: WorkerClient,
  key: CryptoKey,
): Promise<BucketShape> {
  const out: BucketShape = { projects: [], forms: [], presets: [] }
  for (const bucket of ['projects', 'forms', 'presets'] as const) {
    const remote = await client.getBucket(bucket)
    if (!remote.exists)
      continue
    try {
      const decoded = await decryptJson<Identified[]>(
        key,
        remote.ciphertext,
        remote.iv,
      );
      (out as Record<SyncBucket, Identified[]>)[bucket] = decoded
    }
    catch (err) {
      throw new Error(
        `decryption failed for ${bucket} — wrong passphrase? (${err instanceof Error ? err.message : err})`,
      )
    }
  }
  return out
}

async function loadLocal(): Promise<BucketShape> {
  const [projects, forms, presets] = await Promise.all([
    listRawProjects(),
    listRawForms(),
    listRawPresets(),
  ])
  return { projects, forms, presets }
}

async function writeLocal(data: BucketShape): Promise<void> {
  await Promise.all([
    saveProjects(data.projects),
    saveForms(data.forms),
    savePresets(data.presets),
  ])
}

function mergeById<T extends Identified & { deletedAt?: number }>(
  local: T[],
  remote: T[],
): T[] {
  const byId = new Map<string, T>()
  for (const record of [...local, ...remote]) {
    const existing = byId.get(record.id)
    if (!existing) {
      byId.set(record.id, record)
      continue
    }
    if (record.updatedAt > existing.updatedAt) {
      byId.set(record.id, record)
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0),
  )
}

function sameAsLocal(a: BucketShape, b: BucketShape): boolean {
  return (
    sameIds(a.projects, b.projects)
    && sameIds(a.forms, b.forms)
    && sameIds(a.presets, b.presets)
  )
}

function sameIds(a: Identified[], b: Identified[]): boolean {
  if (a.length !== b.length)
    return false
  const am = new Map(a.map(x => [x.id, x.updatedAt]))
  for (const r of b) {
    if (am.get(r.id) !== r.updatedAt)
      return false
  }
  return true
}

function idle(reason: string): SyncResult {
  return { ok: true, reason, pulled: {}, pushed: {} }
}

/** Sign in interactively + write the new id_token to the session. */
export async function signInInteractive(): Promise<SyncSession> {
  const config = await getSyncConfig()
  if (!config.googleClientId)
    throw new Error('Set Google OAuth client ID first')
  const result = await signInWithGoogle(config.googleClientId, true)
  const existing = (await getSyncSession()) ?? {
    keyB64: '',
    saltB64: '',
  }
  const session: SyncSession = {
    idToken: result.idToken,
    idTokenExp: result.exp,
    keyB64: existing.keyB64,
    saltB64: existing.saltB64,
  }
  await saveSyncSession(session)
  await patchSyncConfig({
    googleSub: result.sub,
    googleEmail: result.email,
    lastStatus: session.keyB64 ? 'idle' : 'needs-passphrase',
    lastError: null,
  })
  return session
}

/** Derive + store the encryption key from a passphrase. Fetches the salt from the worker. */
export async function setPassphrase(passphrase: string): Promise<void> {
  const config = await getSyncConfig()
  const session = await getSyncSession()
  if (!session?.idToken)
    throw new Error('sign in with Google first')
  const client = new WorkerClient(config.workerUrl, session.idToken)
  const { salt } = await client.getSalt()
  const key = await deriveKeyFromPassphrase(passphrase, salt)
  const keyB64 = await exportKey(key)
  const next: SyncSession = {
    idToken: session.idToken,
    idTokenExp: session.idTokenExp,
    keyB64,
    saltB64: salt,
  }
  await saveSyncSession(next)
  await patchSyncConfig({ lastStatus: 'idle', lastError: null })
}

export async function signOut(): Promise<void> {
  await clearSyncSession()
  await patchSyncConfig({
    googleSub: null,
    googleEmail: null,
    enabled: false,
    lastStatus: 'idle',
    lastError: null,
  })
}
