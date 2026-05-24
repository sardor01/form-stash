export function* walkElements(
  root: Document | Element | ShadowRoot,
): Generator<Element> {
  if (root instanceof Element) yield root;
  const queue: (Document | Element | ShadowRoot)[] = [root];
  while (queue.length) {
    const node = queue.shift()!;
    const children =
      node instanceof Document || node instanceof ShadowRoot
        ? Array.from(node.children)
        : Array.from(node.children);
    for (const child of children) {
      yield child;
      queue.push(child);
      if (child.shadowRoot) queue.push(child.shadowRoot);
    }
  }
}

export function queryAllDeep(
  root: Document | Element | ShadowRoot,
  selector: string,
): Element[] {
  const out: Element[] = [];
  for (const el of walkElements(root)) {
    try {
      if (el.matches(selector)) out.push(el);
    } catch {
      /* invalid selector for some nodes — ignore */
    }
  }
  return out;
}

export function findDeep(
  root: Document | Element | ShadowRoot,
  selector: string,
): Element | null {
  for (const el of walkElements(root)) {
    try {
      if (el.matches(selector)) return el;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function isInShadowRoot(el: Element): boolean {
  return el.getRootNode() instanceof ShadowRoot;
}

export function getOwningForm(el: Element): HTMLFormElement | null {
  if (el instanceof HTMLInputElement && el.form) return el.form;
  return el.closest('form');
}

export function getAriaLabel(el: Element): string | undefined {
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/);
    const root = el.getRootNode();
    const labels = ids
      .map((id) => {
        if (root instanceof Document || root instanceof ShadowRoot) {
          return root.getElementById(id);
        }
        return null;
      })
      .filter((n): n is HTMLElement => !!n)
      .map((n) => n.textContent?.trim() ?? '')
      .filter(Boolean);
    if (labels.length) return labels.join(' ');
  }
  if (el instanceof HTMLInputElement && el.labels && el.labels.length) {
    const text = Array.from(el.labels)
      .map((l) => l.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }
  const id = el.getAttribute('id');
  if (id) {
    const root = el.getRootNode();
    if (root instanceof Document || root instanceof ShadowRoot) {
      const label = root.querySelector(`label[for="${cssEscape(id)}"]`);
      if (label?.textContent) return label.textContent.trim();
    }
  }
  return undefined;
}

export function getTestId(el: Element): string | undefined {
  return (
    el.getAttribute('data-testid') ||
    el.getAttribute('data-test') ||
    el.getAttribute('data-cy') ||
    undefined
  );
}

export function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

/**
 * Generates a stable CSS path from `from` (inclusive root) down to `to`.
 * Uses tag + nth-of-type indices. Stays within the same shadow tree.
 */
export function generateCssPath(to: Element, from: Element | null): string {
  const segments: string[] = [];
  let current: Element | null = to;
  while (current && current !== from) {
    const parent: Element | null = current.parentElement;
    const tag = current.tagName.toLowerCase();
    if (!parent) {
      segments.unshift(tag);
      break;
    }
    const siblings = Array.from(parent.children).filter(
      (c) => c.tagName === current!.tagName,
    );
    const idx = siblings.indexOf(current) + 1;
    segments.unshift(
      siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag,
    );
    current = parent;
  }
  return segments.join(' > ');
}

export function waitForElement(
  root: Document | Element | ShadowRoot,
  predicate: () => Element | null,
  timeoutMs: number,
): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = predicate();
    if (existing) {
      resolve(existing);
      return;
    }
    let done = false;
    const finish = (val: Element | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      observer.disconnect();
      resolve(val);
    };
    const observer = new MutationObserver(() => {
      const hit = predicate();
      if (hit) finish(hit);
    });
    const target =
      root instanceof Document ? root.documentElement : (root as Node);
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
