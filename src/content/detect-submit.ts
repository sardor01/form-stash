import type { Settings } from '../shared/types';
import { getOwningForm } from './dom-utils';

type Listener = (info: SubmitInfo) => void;

export interface SubmitInfo {
  /** The form (or null if a button outside a form was clicked) */
  form: HTMLFormElement | null;
  /** Fallback root if no form was found */
  root: Element | Document;
  source: 'click' | 'submit-event' | 'enter-key';
}

let attached = false;
let lastFireTs = 0;
const listeners = new Set<Listener>();

export function onSubmitDetected(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function attachSubmitDetection(settings: Settings): void {
  if (attached) return;
  attached = true;

  document.addEventListener(
    'click',
    (e) => handleClick(e, settings),
    { capture: true },
  );
  document.addEventListener(
    'submit',
    (e) => handleSubmit(e, settings),
    { capture: true },
  );
  document.addEventListener(
    'keydown',
    (e) => handleEnterKey(e, settings),
    { capture: true },
  );
}

function isSubmitButton(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const submitLike = target.closest(
    'button[type=submit], input[type=submit]',
  );
  if (submitLike) return submitLike as HTMLElement;

  const button = target.closest('button');
  if (!button) return null;
  const explicitType = button.getAttribute('type');
  if (explicitType && explicitType !== 'submit') return null;
  if (button.closest('form')) return button as HTMLElement;
  return null;
}

function handleClick(e: MouseEvent, settings: Settings): void {
  if (!settings.autoPromptOnSubmit) return;
  const submit = isSubmitButton(e.target);
  if (!submit) return;
  const form = getOwningForm(submit);
  fire({
    form,
    root: form ?? document,
    source: 'click',
  }, e, settings);
}

function handleSubmit(e: Event, settings: Settings): void {
  if (!settings.autoPromptOnSubmit) return;
  if (!(e.target instanceof HTMLFormElement)) return;
  fire(
    { form: e.target, root: e.target, source: 'submit-event' },
    e,
    settings,
  );
}

function handleEnterKey(e: KeyboardEvent, settings: Settings): void {
  if (!settings.autoPromptOnSubmit) return;
  if (e.key !== 'Enter') return;
  if (
    e.target instanceof HTMLTextAreaElement ||
    (e.target instanceof HTMLElement && e.target.isContentEditable)
  ) {
    return;
  }
  const form = e.target instanceof Element ? getOwningForm(e.target) : null;
  if (!form) return;
  fire({ form, root: form, source: 'enter-key' }, e, settings);
}

function fire(
  info: SubmitInfo,
  e: Event,
  settings: Settings,
): void {
  const now = Date.now();
  if (now - lastFireTs < 400) return;
  lastFireTs = now;

  if (settings.preventSubmitOnCapture) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  for (const listener of listeners) {
    try {
      listener(info);
    } catch (err) {
      console.error('[form-stash] submit listener failed', err);
    }
  }
}
