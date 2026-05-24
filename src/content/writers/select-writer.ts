import type { FieldSnapshot, Settings } from '../../shared/types';
import {
  dispatchInputEvents,
  setNativeValue,
} from './native-value';

export function writeSelect(
  el: Element,
  snap: FieldSnapshot,
  settings: Settings,
): void {
  if (!(el instanceof HTMLSelectElement)) {
    throw new Error('writeSelect requires HTMLSelectElement');
  }
  if (el.multiple) {
    const target = new Set(Array.isArray(snap.value) ? snap.value : []);
    let changed = false;
    for (const option of Array.from(el.options)) {
      const should = target.has(option.value);
      if (option.selected !== should) {
        option.selected = should;
        changed = true;
      }
    }
    if (changed) dispatchInputEvents(el, { blur: settings.fillEventBlur });
  } else {
    const value = typeof snap.value === 'string' ? snap.value : '';
    setNativeValue(el, value);
    dispatchInputEvents(el, { blur: settings.fillEventBlur });
  }
}
