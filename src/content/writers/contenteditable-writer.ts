import type { FieldSnapshot } from '../../shared/types';

export function writeContenteditable(
  el: Element,
  snap: FieldSnapshot,
): void {
  if (!(el instanceof HTMLElement)) return;
  el.focus();
  const text = typeof snap.value === 'string' ? snap.value : '';

  try {
    document.execCommand('selectAll', false);
    const ok = document.execCommand('insertText', false, text);
    if (ok) return;
  } catch {
    /* fall through to fallback */
  }

  el.textContent = text;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
