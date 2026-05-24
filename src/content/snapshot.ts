import type {
  CandidateForm,
  CaptureResult,
  FieldSelector,
  FieldSnapshot,
  FieldType,
  Settings,
} from '../shared/types';
import {
  cssEscape,
  generateCssPath,
  getAriaLabel,
  getOwningForm,
  getTestId,
  isInShadowRoot,
  queryAllDeep,
  walkElements,
} from './dom-utils';

const NATIVE_SELECTOR = [
  'input:not([type=submit]):not([type=button]):not([type=reset]):not([type=image])',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role=combobox]',
  '[role=listbox]',
  '[role=switch]',
  '[role=checkbox]',
  '[role=radio]',
  '[role=spinbutton]',
  '[role=slider]',
].join(',');

const CUSTOM_ROLES = new Set([
  'combobox',
  'listbox',
  'switch',
  'spinbutton',
  'slider',
]);

const ARIA_BOOLEAN_ROLES = new Set(['switch', 'checkbox', 'radio']);

export function detectFields(
  root: Document | Element | ShadowRoot,
  settings: Settings,
): FieldSnapshot[] {
  const rawElements = queryAllDeep(root, NATIVE_SELECTOR);

  const deduped = dedupeRadios(rawElements);
  const snapshots: FieldSnapshot[] = [];
  for (const el of deduped) {
    if (!isFillableTarget(el, settings)) continue;
    const snapshot = snapshotField(el, root);
    if (snapshot) snapshots.push(snapshot);
  }
  return snapshots;
}

export function countFields(
  root: Document | Element | ShadowRoot,
  settings: Settings,
): number {
  return detectFields(root, settings).length;
}

/**
 * Find all <form>-like containers in the document for the manual capture picker.
 * Returns the document body as a fallback "everything on page" candidate when
 * there are loose form-like elements that don't belong to a <form>.
 */
export function listCandidateForms(
  doc: Document,
  settings: Settings,
): CandidateForm[] {
  const forms = queryAllDeep(doc, 'form');
  const candidates: CandidateForm[] = [];
  forms.forEach((f, i) => {
    const count = countFields(f, settings);
    if (count === 0) return;
    candidates.push({
      index: i,
      label:
        (f.getAttribute('name') ||
          f.getAttribute('id') ||
          f.getAttribute('aria-label') ||
          `Form ${i + 1}`) +
        ` · ${count} field${count === 1 ? '' : 's'}`,
      fieldCount: count,
      selector: buildFormSelector(f as HTMLFormElement, i),
    });
  });

  const allCount = countFields(doc, settings);
  const inForms = candidates.reduce((s, c) => s + c.fieldCount, 0);
  if (allCount > inForms) {
    candidates.push({
      index: -1,
      label: `Everything on page · ${allCount} field${allCount === 1 ? '' : 's'}`,
      fieldCount: allCount,
      selector: '__document__',
    });
  } else if (candidates.length === 0 && allCount > 0) {
    candidates.push({
      index: -1,
      label: `Everything on page · ${allCount} field${allCount === 1 ? '' : 's'}`,
      fieldCount: allCount,
      selector: '__document__',
    });
  }
  return candidates;
}

export function resolveCaptureRoot(
  doc: Document,
  selector: string | undefined,
): Document | Element {
  if (!selector || selector === '__document__') return doc;
  try {
    const el = doc.querySelector(selector);
    if (el) return el;
  } catch {
    /* ignore */
  }
  return doc;
}

export function captureFromRoot(
  root: Document | Element,
  settings: Settings,
): CaptureResult {
  const fields = detectFields(root, settings);
  return {
    url: location.href,
    origin: location.origin,
    path: location.pathname,
    fields,
  };
}

function buildFormSelector(form: HTMLFormElement, index: number): string {
  if (form.id) return `form#${cssEscape(form.id)}`;
  if (form.getAttribute('name'))
    return `form[name="${cssEscape(form.getAttribute('name')!)}"]`;
  return `form:nth-of-type(${index + 1})`;
}

function isFillableTarget(el: Element, settings: Settings): boolean {
  if (el instanceof HTMLInputElement) {
    const t = (el.type || 'text').toLowerCase();
    if (['submit', 'button', 'reset', 'image', 'file'].includes(t))
      return false;
    if (t === 'hidden') return false;
    if (t === 'password' && !settings.capturePasswords) return false;
  }
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.hasAttribute('disabled')) return false;
  return true;
}

function dedupeRadios(elements: Element[]): Element[] {
  const seenRadioNames = new Set<string>();
  const out: Element[] = [];
  for (const el of elements) {
    if (
      el instanceof HTMLInputElement &&
      el.type === 'radio' &&
      el.name
    ) {
      const formId = el.form?.id ?? el.form?.getAttribute('name') ?? '';
      const key = `${formId}::${el.name}`;
      if (seenRadioNames.has(key)) continue;
      seenRadioNames.add(key);
    }
    if (el.getAttribute('role') === 'radio') {
      const groupId = el.closest('[role=radiogroup]')?.id || '';
      const name = el.getAttribute('aria-labelledby') || '';
      const key = `aria-radio::${groupId}::${name}`;
      if (seenRadioNames.has(key)) continue;
      seenRadioNames.add(key);
    }
    out.push(el);
  }
  return out;
}

function snapshotField(
  el: Element,
  root: Document | Element | ShadowRoot,
): FieldSnapshot | null {
  const type = detectType(el);
  if (!type) return null;
  const selector = buildSelector(el, root);
  if (!hasAnySelector(selector)) return null;

  const base: FieldSnapshot = {
    selector,
    type,
    value: null,
    inShadowRoot: isInShadowRoot(el) || undefined,
  };

  switch (type) {
    case 'text':
    case 'textarea':
    case 'number':
    case 'email':
    case 'url':
    case 'tel':
    case 'password':
    case 'date':
    case 'datetime-local':
    case 'time':
    case 'month':
    case 'week':
    case 'color':
    case 'range':
      return {
        ...base,
        value:
          (el as HTMLInputElement | HTMLTextAreaElement).value ?? '',
      };

    case 'select':
      return { ...base, value: (el as HTMLSelectElement).value };

    case 'multiselect': {
      const select = el as HTMLSelectElement;
      return {
        ...base,
        value: Array.from(select.selectedOptions).map((o) => o.value),
      };
    }

    case 'checkbox': {
      if (el instanceof HTMLInputElement) {
        return { ...base, value: el.checked };
      }
      const checked = el.getAttribute('aria-checked');
      return { ...base, value: checked === 'true' };
    }

    case 'radio': {
      if (el instanceof HTMLInputElement) {
        const checked = findCheckedRadio(el, root);
        return { ...base, value: checked?.value ?? null };
      }
      const group = el.closest('[role=radiogroup]') ?? root;
      const checked = queryAllDeep(group, '[role=radio]').find(
        (r) => r.getAttribute('aria-checked') === 'true',
      );
      const label =
        checked?.getAttribute('aria-label') ||
        checked?.textContent?.trim() ||
        null;
      return { ...base, value: label, visibleLabel: label ?? undefined };
    }

    case 'contenteditable': {
      return {
        ...base,
        value: (el as HTMLElement).textContent ?? '',
        htmlContent: (el as HTMLElement).innerHTML,
      };
    }

    case 'custom': {
      return snapshotCustomWidget(el, base, root);
    }
  }
  return null;
}

function snapshotCustomWidget(
  el: Element,
  base: FieldSnapshot,
  root: Document | Element | ShadowRoot,
): FieldSnapshot {
  const role = el.getAttribute('role');

  if (role === 'switch' || role === 'checkbox') {
    return {
      ...base,
      value: el.getAttribute('aria-checked') === 'true',
    };
  }

  const visibleLabel =
    el.getAttribute('aria-activedescendant')
      ? findActiveDescendantText(el, root)
      : (el.textContent?.trim() ?? '');

  const hiddenControl = findAssociatedHiddenControl(el, root);
  const underlyingValue =
    hiddenControl instanceof HTMLInputElement ||
    hiddenControl instanceof HTMLSelectElement
      ? hiddenControl.value
      : undefined;

  if (role === 'spinbutton' || role === 'slider') {
    const v = el.getAttribute('aria-valuenow') || visibleLabel;
    return { ...base, value: v, underlyingValue, visibleLabel };
  }

  return {
    ...base,
    value: underlyingValue ?? visibleLabel ?? '',
    visibleLabel,
    underlyingValue,
  };
}

function findActiveDescendantText(
  el: Element,
  root: Document | Element | ShadowRoot,
): string {
  const id = el.getAttribute('aria-activedescendant');
  if (!id) return '';
  const r =
    root instanceof Element && root.shadowRoot
      ? root.shadowRoot
      : root instanceof Element
        ? root.getRootNode()
        : root;
  if (r instanceof Document || r instanceof ShadowRoot) {
    const target = r.getElementById(id);
    return target?.textContent?.trim() ?? '';
  }
  return '';
}

function findAssociatedHiddenControl(
  el: Element,
  root: Document | Element | ShadowRoot,
): Element | null {
  const labelledBy = el.getAttribute('aria-controls');
  if (labelledBy) {
    const r = el.getRootNode();
    if (r instanceof Document || r instanceof ShadowRoot) {
      const target = r.getElementById(labelledBy);
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement
      ) {
        return target;
      }
    }
  }
  const form = getOwningForm(el);
  const scope = form ?? root;
  const name =
    el.getAttribute('name') || el.getAttribute('data-name');
  if (name) {
    const hidden = queryAllDeep(
      scope,
      `input[name="${cssEscape(name)}"][type=hidden], select[name="${cssEscape(name)}"]`,
    );
    if (hidden[0]) return hidden[0];
  }
  let sibling = el.nextElementSibling;
  while (sibling) {
    if (
      (sibling instanceof HTMLInputElement && sibling.type === 'hidden') ||
      sibling instanceof HTMLSelectElement
    ) {
      return sibling;
    }
    sibling = sibling.nextElementSibling;
  }
  return null;
}

function findCheckedRadio(
  el: HTMLInputElement,
  root: Document | Element | ShadowRoot,
): HTMLInputElement | null {
  const scope = el.form ?? (root as Document);
  const name = el.name;
  if (!name) return el.checked ? el : null;
  const list = queryAllDeep(
    scope as Element | Document,
    `input[type=radio][name="${cssEscape(name)}"]`,
  );
  return (
    (list.find(
      (r) => r instanceof HTMLInputElement && r.checked,
    ) as HTMLInputElement | undefined) ?? null
  );
}

function detectType(el: Element): FieldType | null {
  const role = el.getAttribute('role');
  if (role && CUSTOM_ROLES.has(role)) return 'custom';
  if (role && ARIA_BOOLEAN_ROLES.has(role)) {
    if (role === 'switch' || role === 'checkbox') return 'checkbox';
    if (role === 'radio') return 'radio';
  }
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) {
    return el.multiple ? 'multiselect' : 'select';
  }
  if (el instanceof HTMLInputElement) {
    const t = (el.type || 'text').toLowerCase();
    switch (t) {
      case 'text':
      case 'search':
        return 'text';
      case 'textarea':
        return 'textarea';
      case 'number':
        return 'number';
      case 'email':
        return 'email';
      case 'url':
        return 'url';
      case 'tel':
        return 'tel';
      case 'password':
        return 'password';
      case 'checkbox':
        return 'checkbox';
      case 'radio':
        return 'radio';
      case 'date':
        return 'date';
      case 'datetime-local':
        return 'datetime-local';
      case 'time':
        return 'time';
      case 'month':
        return 'month';
      case 'week':
        return 'week';
      case 'color':
        return 'color';
      case 'range':
        return 'range';
      default:
        return 'text';
    }
  }
  if ((el as HTMLElement).isContentEditable) return 'contenteditable';
  return null;
}

function buildSelector(
  el: Element,
  root: Document | Element | ShadowRoot,
): FieldSelector {
  const sel: FieldSelector = {};
  const name = el.getAttribute('name');
  if (name) sel.name = name;
  const id = el.getAttribute('id');
  if (id) sel.id = id;
  const testId = getTestId(el);
  if (testId) sel.testId = testId;
  const ariaLabel = getAriaLabel(el);
  if (ariaLabel) sel.ariaLabel = ariaLabel;

  const form = getOwningForm(el);
  const anchor =
    form ?? (root instanceof Document ? root.body : (root as Element));
  sel.cssPath = generateCssPath(el, anchor);
  return sel;
}

function hasAnySelector(sel: FieldSelector): boolean {
  return Boolean(
    sel.name || sel.id || sel.testId || sel.ariaLabel || sel.cssPath,
  );
}

export { walkElements };
