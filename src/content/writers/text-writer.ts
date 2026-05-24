import type { FieldSnapshot, Settings } from '../../shared/types'
import { dispatchInputEvents, setNativeValue } from './native-value'

export function writeText(
  el: Element,
  snap: FieldSnapshot,
  settings: Settings,
): void {
  if (
    !(
      el instanceof HTMLInputElement
      || el instanceof HTMLTextAreaElement
      || el instanceof HTMLSelectElement
    )
  ) {
    throw new TypeError('writeText requires input/textarea/select')
  }
  const value = coerceToString(snap.value)
  setNativeValue(el, value)
  dispatchInputEvents(el, { blur: settings.fillEventBlur })
}

function coerceToString(v: FieldSnapshot['value']): string {
  if (v == null)
    return ''
  if (typeof v === 'boolean')
    return v ? 'true' : 'false'
  if (Array.isArray(v))
    return v.join(',')
  return String(v)
}
