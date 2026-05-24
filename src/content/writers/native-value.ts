type ValueHost =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

/**
 * Set a value on a native form control while bypassing React's value tracker,
 * so React (and Vue v-model) see the update on the next event.
 *
 * Why: React patches the instance-level `value` setter to track changes.
 * Calling `el.value = x` writes via the tracker and React thinks nothing changed,
 * reverting on the next render. The prototype-level setter is the un-patched one.
 */
export function setNativeValue(el: ValueHost, value: string): void {
  const proto = Object.getPrototypeOf(el);
  const protoSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  const ownSetter = Object.getOwnPropertyDescriptor(el, 'value')?.set;
  if (ownSetter && ownSetter !== protoSetter && protoSetter) {
    protoSetter.call(el, value);
  } else if (protoSetter) {
    protoSetter.call(el, value);
  } else {
    (el as unknown as { value: string }).value = value;
  }
}

export function setNativeChecked(el: HTMLInputElement, checked: boolean): void {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
  if (setter) setter.call(el, checked);
  else el.checked = checked;
}

export function dispatchInputEvents(
  el: HTMLElement,
  opts: { blur?: boolean } = {},
): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (opts.blur) el.dispatchEvent(new Event('blur', { bubbles: true }));
}
