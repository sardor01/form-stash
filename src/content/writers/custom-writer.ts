import type { FieldSnapshot, Settings } from '../../shared/types'
import { delay, queryAllDeep } from '../dom-utils'
import { dispatchInputEvents, setNativeValue } from './native-value'

const POLL_INTERVAL = 50

export async function writeCustomWidget(
  el: Element,
  snap: FieldSnapshot,
  settings: Settings,
  root: Document | Element | ShadowRoot,
): Promise<'filled' | 'partial' | 'failed'> {
  const role = el.getAttribute('role')

  if (role === 'switch' || role === 'checkbox') {
    const desired = snap.value === true || snap.value === 'true'
    const current = el.getAttribute('aria-checked') === 'true'
    if (current !== desired)
      (el as HTMLElement).click()
    return 'filled'
  }

  const hiddenSelector = el.getAttribute('aria-controls')
  if (snap.underlyingValue != null && hiddenSelector) {
    const hidden = document.getElementById(hiddenSelector)
    if (
      hidden instanceof HTMLInputElement
      || hidden instanceof HTMLSelectElement
    ) {
      setNativeValue(hidden, snap.underlyingValue)
      dispatchInputEvents(hidden, { blur: settings.fillEventBlur })
      return 'filled'
    }
  }

  if (role === 'spinbutton') {
    const target = String(snap.value ?? '')
    if (el instanceof HTMLInputElement) {
      setNativeValue(el, target)
      dispatchInputEvents(el, { blur: settings.fillEventBlur })
      return 'filled'
    }
    el.setAttribute('aria-valuenow', target);
    (el as HTMLElement).dispatchEvent(
      new Event('change', { bubbles: true }),
    )
    return 'filled'
  }

  if (role === 'slider') {
    if (el instanceof HTMLInputElement) {
      setNativeValue(el, String(snap.value ?? ''))
      dispatchInputEvents(el, { blur: settings.fillEventBlur })
      return 'filled'
    }
  }

  return interactionReplay(el, snap, settings, root)
}

async function interactionReplay(
  trigger: Element,
  snap: FieldSnapshot,
  settings: Settings,
  root: Document | Element | ShadowRoot,
): Promise<'filled' | 'partial' | 'failed'> {
  const desiredLabel = snap.visibleLabel ?? String(snap.value ?? '')
  if (!desiredLabel)
    return 'failed';

  (trigger as HTMLElement).click()

  const deadline = Date.now() + settings.perFieldTimeoutMs
  while (Date.now() < deadline) {
    const option = findOptionByText(root, desiredLabel)
    if (option) {
      (option as HTMLElement).click()
      return 'filled'
    }
    await delay(POLL_INTERVAL)
  }
  (trigger as HTMLElement).blur?.()
  return 'failed'
}

function findOptionByText(
  root: Document | Element | ShadowRoot,
  text: string,
): Element | null {
  const candidates = queryAllDeep(
    root,
    '[role=option], [role=menuitem], [role=treeitem], li[data-value]',
  )
  const lower = text.trim().toLowerCase()
  return (
    candidates.find((c) => {
      const t = (c.textContent ?? '').trim().toLowerCase()
      return t === lower || t.includes(lower)
    }) ?? null
  )
}
