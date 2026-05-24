import type {
  FieldSnapshot,
  FormDef,
  Preset,
  Project,
} from '../shared/types'
import type { SaveTarget } from './SaveForm'
import { v4 as uuid } from 'uuid'

export interface BuildPresetArgs {
  label: string
  target: SaveTarget
  fields: FieldSnapshot[]
  page: { url: string, origin: string, path: string }
  existingPresets: Preset[]
}

export function buildPreset({
  label,
  target,
  fields,
  page,
}: BuildPresetArgs): Preset {
  const now = Date.now()
  if (target.kind === 'standalone') {
    return {
      id: uuid(),
      label,
      url: page.url,
      origin: page.origin,
      path: page.path,
      createdAt: now,
      updatedAt: now,
      fields,
      formId: null,
      stepOrder: null,
      projectId: target.projectId,
    }
  }
  return {
    id: uuid(),
    label,
    url: page.url,
    origin: page.origin,
    path: page.path,
    createdAt: now,
    updatedAt: now,
    fields,
    formId: target.formId,
    stepOrder: target.stepOrder,
    projectId: null,
  }
}

export function newProject(name: string): Project {
  const now = Date.now()
  return { id: uuid(), name, createdAt: now, updatedAt: now }
}

export function newForm(label: string, projectId: string | null): FormDef {
  const now = Date.now()
  return {
    id: uuid(),
    label,
    projectId,
    createdAt: now,
    updatedAt: now,
  }
}

export function stepCountsByForm(presets: Preset[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of presets) {
    if (p.formId)
      out[p.formId] = (out[p.formId] ?? 0) + 1
  }
  return out
}

export function projectIdFor(preset: Preset, forms: FormDef[]): string | null {
  if (preset.formId) {
    return forms.find(f => f.id === preset.formId)?.projectId ?? null
  }
  return preset.projectId
}
