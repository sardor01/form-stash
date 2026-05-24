import type { FieldSnapshot, Settings } from '../../shared/types'
import {
  dispatchInputEvents,
  setNativeChecked,
} from './native-value'

export function writeCheckbox(
  el: Element,
  snap: FieldSnapshot,
  settings: Settings,
): void {
  const desired = snap.value === true || snap.value === 'true'

  if (el instanceof HTMLInputElement) {
    if (el.checked !== desired) {
      el.click()
      if (el.checked !== desired) {
        setNativeChecked(el, desired)
        dispatchInputEvents(el, { blur: settings.fillEventBlur })
      }
    }
    return
  }

  const current = el.getAttribute('aria-checked') === 'true'
  if (current !== desired) {
    (el as HTMLElement).click()
  }
}

export function writeRadio(
  el: Element,
  snap: FieldSnapshot,
  settings: Settings,
  root: Document | Element | ShadowRoot,
): void {
  const desired = snap.value
  if (desired == null)
    return

  if (el instanceof HTMLInputElement && el.type === 'radio') {
    const want = String(desired)
    const scope = el.form ?? (root as Document)
    const radios = Array.from(
      (scope as ParentNode).querySelectorAll<HTMLInputElement>(
        `input[type=radio][name="${cssEscape(el.name)}"]`,
      ),
    )
    const target = radios.find(r => r.value === want)
    if (target) {
      target.click()
      if (!target.checked) {
        setNativeChecked(target, true)
        dispatchInputEvents(target, { blur: settings.fillEventBlur })
      }
    }
    return
  }

  // ARIA radio (Radix/shadcn-style: <button role="radio" value="...">).
  // Capture stores `underlyingValue` = the button's `value` attribute and
  // `visibleLabel` = the wrapping <label>'s text. Match by underlyingValue
  // first since that's the only stable identifier across renders.
  const desiredValue = snap.underlyingValue ?? String(desired)
  const desiredLabel = snap.visibleLabel ?? String(desired)

  const group
    = el.getAttribute('role') === 'radiogroup'
      ? el
      : (el.closest('[role=radiogroup]')
        ?? (root instanceof Element || root instanceof Document
          ? root
          : document))
  const radios = Array.from(
    (group as ParentNode).querySelectorAll('[role=radio]'),
  )

  const match
    = radios.find(r => r.getAttribute('value') === desiredValue)
      ?? radios.find(r => r.getAttribute('aria-label') === desiredLabel)
      ?? radios.find(r => r.textContent?.trim() === desiredLabel)
      ?? radios.find(
        r => r.closest('label')?.textContent?.trim() === desiredLabel,
      )

  if (match) {
    (match as HTMLElement).click()
  }
}

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape)
    return CSS.escape(s)
  return s.replace(/[^\w-]/g, c => `\\${c}`)
}
