import type {
  CaptureResult,
  FillReport,
  PageInfo,
  Preset,
} from './types'

export type Message
  = | { kind: 'CAPTURE_NOW', candidateIndex?: number }
    | { kind: 'GET_CANDIDATES' }
    | { kind: 'APPLY_PRESET', preset: Preset }
    | { kind: 'GET_PAGE_INFO' }
    | { kind: 'PING' }

export type MessageResponse<M extends Message['kind']> = M extends 'CAPTURE_NOW'
  ? CaptureResult
  : M extends 'GET_CANDIDATES'
    ? { candidates: CaptureResult['candidates'] }
    : M extends 'APPLY_PRESET'
      ? FillReport
      : M extends 'GET_PAGE_INFO'
        ? PageInfo
        : M extends 'PING'
          ? { ok: true }
          : never

export async function sendToTab<M extends Message>(
  tabId: number,
  message: M,
): Promise<MessageResponse<M['kind']>> {
  return (await browser.tabs.sendMessage(tabId, message)) as MessageResponse<
    M['kind']
  >
}

export type ActiveTab = Browser.tabs.Tab

export async function getActiveTab(): Promise<ActiveTab | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true })
  return tabs[0] ?? null
}
