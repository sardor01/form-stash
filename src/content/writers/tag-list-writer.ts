import type { FieldSnapshot, Settings } from '../../shared/types'
import { delay } from '../dom-utils'
import { dispatchInputEvents, setNativeValue } from './native-value'

const FLUSH_WAIT_MS = 60
const ADD_BUTTON_RE = /^[\s+]*(add|create|insert)\b/i

/**
 * Tag-input pattern (e.g. shadcn/Radix-style "chip" inputs where committed
 * values live in React state and only render as <span> chips).
 *
 * Strategy: for each value, write it into the draft <input>, dispatch
 * input/change so React state catches up, dispatch Enter to trigger the
 * commit handler, wait a short tick, then verify the input cleared. If
 * Enter didn't commit, fall back to clicking an "Add" button nearby.
 */
export async function writeTagList(
  el: Element,
  snap: FieldSnapshot,
  settings: Settings,
): Promise<void> {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return
  }
  const values = Array.isArray(snap.value) ? snap.value : []
  if (values.length === 0)
    return

  for (const value of values) {
    if (!value)
      continue
    setNativeValue(el, value)
    dispatchInputEvents(el, { blur: false })

    // Let React flush state + re-bind the keydown handler closure with the
    // fresh draft value before we send Enter.
    await delay(FLUSH_WAIT_MS)

    dispatchEnter(el)
    await delay(FLUSH_WAIT_MS)

    // If the draft input still holds the value, the Enter handler probably
    // doesn't commit — try the visible "Add" button nearby.
    if (el.value === value) {
      const addBtn = findAddButtonNear(el)
      if (addBtn) {
        addBtn.click()
        await delay(FLUSH_WAIT_MS)
      }
    }
  }

  // Clear the draft so a fresh re-apply doesn't leave the last value typed.
  if (el.value) {
    setNativeValue(el, '')
    dispatchInputEvents(el, { blur: settings.fillEventBlur })
  }
}

function dispatchEnter(el: Element): void {
  const init: KeyboardEventInit = {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true,
  }
  el.dispatchEvent(new KeyboardEvent('keydown', init))
  el.dispatchEvent(new KeyboardEvent('keypress', init))
  el.dispatchEvent(new KeyboardEvent('keyup', init))
}

function findAddButtonNear(input: HTMLElement): HTMLElement | null {
  // Walk up a few levels and look for a button labelled "Add"/"+ Add" etc.
  let scope: HTMLElement | null = input.parentElement
  for (let i = 0; i < 4 && scope; i++) {
    const buttons = Array.from(
      scope.querySelectorAll<HTMLElement>('button, [role=button]'),
    )
    const hit = buttons.find((b) => {
      const text = (b.textContent || '').trim()
      if (ADD_BUTTON_RE.test(text))
        return true
      const aria = b.getAttribute('aria-label')?.trim() || ''
      return ADD_BUTTON_RE.test(aria)
    })
    if (hit)
      return hit
    scope = scope.parentElement
  }
  return null
}
