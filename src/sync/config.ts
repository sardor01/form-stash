import type { SyncConfig, SyncSession } from './types'
import {
  DEFAULT_SYNC_CONFIG,

} from './types'

const CONFIG_KEY = 'syncConfig'
const SESSION_KEY = 'syncSession'

export async function getSyncConfig(): Promise<SyncConfig> {
  const raw = (await browser.storage.local.get(CONFIG_KEY))[CONFIG_KEY] as
    | Partial<SyncConfig>
    | undefined
  return { ...DEFAULT_SYNC_CONFIG, ...(raw ?? {}) }
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  await browser.storage.local.set({ [CONFIG_KEY]: config })
}

export async function patchSyncConfig(
  patch: Partial<SyncConfig>,
): Promise<SyncConfig> {
  const current = await getSyncConfig()
  const next = { ...current, ...patch }
  await saveSyncConfig(next)
  return next
}

interface StorageAreaLike {
  get: (keys?: string | string[]) => Promise<Record<string, unknown>>
  set: (items: Record<string, unknown>) => Promise<void>
  remove: (keys: string | string[]) => Promise<void>
}

/** Session storage holds short-lived secrets and is cleared on browser close. */
function sessionArea(): StorageAreaLike | undefined {
  const session = (
    browser.storage as unknown as {
      session?: StorageAreaLike
    }
  ).session
  return session
}

export async function getSyncSession(): Promise<SyncSession | null> {
  const area = sessionArea()
  if (!area)
    return null
  const raw = (await area.get(SESSION_KEY))[SESSION_KEY] as
    | SyncSession
    | undefined
  return raw ?? null
}

export async function saveSyncSession(session: SyncSession): Promise<void> {
  const area = sessionArea()
  if (!area)
    return
  await area.set({ [SESSION_KEY]: session })
}

export async function clearSyncSession(): Promise<void> {
  const area = sessionArea()
  if (!area)
    return
  await area.remove(SESSION_KEY)
}

export function onSyncConfigChanged(callback: () => void): () => void {
  const handler = (
    changes: Parameters<
      Parameters<typeof browser.storage.onChanged.addListener>[0]
    >[0],
    area: string,
  ) => {
    if (area === 'local' && changes[CONFIG_KEY])
      callback()
  }
  browser.storage.onChanged.addListener(handler)
  return () => browser.storage.onChanged.removeListener(handler)
}
