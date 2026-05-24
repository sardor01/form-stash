import type {
  FieldSelector,
  FieldSnapshot,
  FieldType,
  FillReport,
  FillResult,
  Preset,
  Settings,
} from '../shared/types'
import {
  cssEscape,
  delay,
  getOwningForm,
  waitForElement,
  walkElements,
} from './dom-utils'
import { writeContenteditable } from './writers/contenteditable-writer'
import { writeCustomWidget } from './writers/custom-writer'
import { writeSelect } from './writers/select-writer'
import { writeTagList } from './writers/tag-list-writer'
import { writeText } from './writers/text-writer'
import { writeCheckbox, writeRadio } from './writers/toggle-writer'

const TEXT_TYPES = new Set<FieldType>([
  'text',
  'textarea',
  'number',
  'email',
  'url',
  'tel',
  'password',
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
  'color',
  'range',
])

export async function applyPreset(
  preset: Preset,
  settings: Settings,
): Promise<FillReport> {
  const results: FillResult[] = []
  for (const field of preset.fields) {
    const result = await applyOne(field, settings)
    results.push(result)
    await delay(20)
  }

  return summarize(preset.id, results)
}

async function applyOne(
  field: FieldSnapshot,
  settings: Settings,
): Promise<FillResult> {
  const base = { selector: field.selector, type: field.type }

  if (field.type === 'password' && !settings.capturePasswords) {
    return {
      ...base,
      status: 'skipped',
      detail: 'password capture is disabled in settings',
    }
  }

  const el = await waitForField(field.selector, settings.perFieldTimeoutMs)
  if (!el)
    return { ...base, status: 'not-found' }

  try {
    if (TEXT_TYPES.has(field.type)) {
      writeText(el, field, settings)
      return { ...base, status: 'filled' }
    }

    switch (field.type) {
      case 'select':
      case 'multiselect':
        writeSelect(el, field, settings)
        return { ...base, status: 'filled' }
      case 'checkbox':
        writeCheckbox(el, field, settings)
        return { ...base, status: 'filled' }
      case 'radio':
        writeRadio(el, field, settings, document)
        return { ...base, status: 'filled' }
      case 'contenteditable':
        writeContenteditable(el, field)
        return { ...base, status: 'filled' }
      case 'tag-list':
        await writeTagList(el, field, settings)
        return { ...base, status: 'filled' }
      case 'custom': {
        const root = getOwningForm(el) ?? document
        const outcome = await writeCustomWidget(el, field, settings, root)
        return {
          ...base,
          status: outcome === 'failed' ? 'error' : 'filled',
          detail:
            outcome === 'failed'
              ? 'no underlying control and no matching option found'
              : undefined,
        }
      }
    }
  }
  catch (err) {
    return {
      ...base,
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
  return { ...base, status: 'skipped', detail: `unhandled type ${field.type}` }
}

async function waitForField(
  selector: FieldSelector,
  timeoutMs: number,
): Promise<Element | null> {
  return await waitForElement(
    document,
    () => resolveByAnySelector(selector),
    timeoutMs,
  )
}

function resolveByAnySelector(selector: FieldSelector): Element | null {
  return (
    resolveByName(selector.name)
    ?? resolveById(selector.id)
    ?? resolveByTestId(selector.testId)
    ?? resolveByAriaLabel(selector.ariaLabel)
    ?? resolveByCssPath(selector.cssPath)
  )
}

function resolveByName(name?: string): Element | null {
  if (!name)
    return null
  for (const el of walkElements(document)) {
    if (
      (el instanceof HTMLInputElement
        || el instanceof HTMLTextAreaElement
        || el instanceof HTMLSelectElement
        || el.hasAttribute('name'))
      && el.getAttribute('name') === name
    ) {
      return el
    }
  }
  return null
}

function resolveById(id?: string): Element | null {
  if (!id)
    return null
  const direct = document.getElementById(id)
  if (direct)
    return direct
  for (const el of walkElements(document)) {
    if (el.id === id)
      return el
  }
  return null
}

function resolveByTestId(testId?: string): Element | null {
  if (!testId)
    return null
  for (const el of walkElements(document)) {
    if (
      el.getAttribute('data-testid') === testId
      || el.getAttribute('data-test') === testId
      || el.getAttribute('data-cy') === testId
    ) {
      return el
    }
  }
  return null
}

function resolveByAriaLabel(ariaLabel?: string): Element | null {
  if (!ariaLabel)
    return null
  for (const el of walkElements(document)) {
    if (el.getAttribute('aria-label') === ariaLabel)
      return el
  }
  for (const el of walkElements(document)) {
    if (el instanceof HTMLLabelElement && el.textContent?.trim() === ariaLabel) {
      const id = el.getAttribute('for')
      if (id) {
        const target = document.getElementById(id)
        if (target)
          return target
      }
    }
  }
  return null
}

function resolveByCssPath(path?: string): Element | null {
  if (!path)
    return null
  try {
    return document.querySelector(path)
  }
  catch {
    return null
  }
}

function summarize(presetId: string, results: FillResult[]): FillReport {
  return {
    presetId,
    total: results.length,
    filled: results.filter(r => r.status === 'filled').length,
    notFound: results.filter(r => r.status === 'not-found').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errored: results.filter(r => r.status === 'error').length,
    results,
  }
}

export { cssEscape }
