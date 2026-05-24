import type { FieldType, FormDef, Preset, Project, Settings } from './types'
import { z } from 'zod'
import {
  DEFAULT_SETTINGS,

} from './types'

const SCHEMA_VERSION = 2

const FIELD_TYPES: readonly FieldType[] = [
  'text',
  'textarea',
  'number',
  'email',
  'url',
  'tel',
  'password',
  'select',
  'multiselect',
  'checkbox',
  'radio',
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
  'color',
  'range',
  'custom',
  'contenteditable',
]

const fieldSelectorSchema = z.object({
  name: z.string().optional(),
  id: z.string().optional(),
  testId: z.string().optional(),
  ariaLabel: z.string().optional(),
  cssPath: z.string().optional(),
})

const fieldSnapshotSchema = z.object({
  selector: fieldSelectorSchema,
  type: z.enum(FIELD_TYPES as unknown as [FieldType, ...FieldType[]]),
  value: z.union([z.string(), z.array(z.string()), z.boolean(), z.null()]),
  visibleLabel: z.string().optional(),
  underlyingValue: z.string().optional(),
  inShadowRoot: z.boolean().optional(),
  htmlContent: z.string().optional(),
})

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().optional(),
})

const formSchema = z.object({
  id: z.string(),
  label: z.string(),
  projectId: z.string().nullable(),
  entryUrl: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().optional(),
})

const presetSchema = z.object({
  id: z.string(),
  label: z.string(),
  url: z.string(),
  origin: z.string(),
  path: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().optional(),
  fields: z.array(fieldSnapshotSchema),
  formId: z.string().nullable(),
  stepOrder: z.number().nullable(),
  projectId: z.string().nullable(),
})

const settingsSchema = z.object({
  autoPromptOnSubmit: z.boolean(),
  preventSubmitOnCapture: z.boolean(),
  capturePasswords: z.boolean(),
  fillEventBlur: z.boolean(),
  perFieldTimeoutMs: z.number(),
})

const STORAGE_KEYS = {
  projects: 'projects',
  forms: 'forms',
  presets: 'presets',
  settings: 'settings',
  schemaVersion: 'schemaVersion',
} as const

const storage = () => browser.storage.local

async function readArray<T>(
  key: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const raw = (await storage().get(key))[key]
  if (!Array.isArray(raw))
    return []
  const arr: T[] = []
  for (const item of raw) {
    const parsed = schema.safeParse(item)
    if (parsed.success)
      arr.push(parsed.data)
  }
  return arr
}

async function writeArray<T>(key: string, value: T[]): Promise<void> {
  await storage().set({ [key]: value })
}

export async function ensureSchema(): Promise<void> {
  const { [STORAGE_KEYS.schemaVersion]: v } = await storage().get(
    STORAGE_KEYS.schemaVersion,
  )
  if (typeof v !== 'number') {
    await storage().set({ [STORAGE_KEYS.schemaVersion]: SCHEMA_VERSION })
    return
  }
  if (v < 2) {
    await migrateV1toV2()
    await storage().set({ [STORAGE_KEYS.schemaVersion]: 2 })
  }
}

async function migrateV1toV2(): Promise<void> {
  const projectsRaw = (await storage().get(STORAGE_KEYS.projects))[
    STORAGE_KEYS.projects
  ]
  if (Array.isArray(projectsRaw)) {
    const migrated = projectsRaw.map(p => ({
      ...p,
      updatedAt:
        typeof p.updatedAt === 'number' ? p.updatedAt : (p.createdAt ?? Date.now()),
    }))
    await storage().set({ [STORAGE_KEYS.projects]: migrated })
  }
}

/** Lists exclude tombstones (deleted records). */
export async function listProjects(): Promise<Project[]> {
  return (await listRawProjects()).filter(p => p.deletedAt == null)
}

export async function listForms(): Promise<FormDef[]> {
  return (await listRawForms()).filter(f => f.deletedAt == null)
}

export async function listPresets(): Promise<Preset[]> {
  return (await listRawPresets()).filter(p => p.deletedAt == null)
}

/** Raw lists include tombstones — only the sync engine should use these. */
export async function listRawProjects(): Promise<Project[]> {
  return readArray(STORAGE_KEYS.projects, projectSchema)
}

export async function listRawForms(): Promise<FormDef[]> {
  return readArray(STORAGE_KEYS.forms, formSchema)
}

export async function listRawPresets(): Promise<Preset[]> {
  return readArray(STORAGE_KEYS.presets, presetSchema)
}

export async function getSettings(): Promise<Settings> {
  const raw = (await storage().get(STORAGE_KEYS.settings))[
    STORAGE_KEYS.settings
  ]
  const parsed = settingsSchema.safeParse(raw)
  return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await storage().set({ [STORAGE_KEYS.settings]: settings })
}

export async function saveProjects(projects: Project[]): Promise<void> {
  await writeArray(STORAGE_KEYS.projects, projects)
}

export async function saveForms(forms: FormDef[]): Promise<void> {
  await writeArray(STORAGE_KEYS.forms, forms)
}

export async function savePresets(presets: Preset[]): Promise<void> {
  await writeArray(STORAGE_KEYS.presets, presets)
}

export async function upsertProject(project: Project): Promise<void> {
  const list = await listRawProjects()
  const idx = list.findIndex(p => p.id === project.id)
  if (idx >= 0)
    list[idx] = project
  else list.push(project)
  await saveProjects(list)
}

export async function deleteProject(
  projectId: string,
  mode: 'delete-contents' | 'unassign',
): Promise<void> {
  const now = Date.now()
  const [projects, forms, presets] = await Promise.all([
    listRawProjects(),
    listRawForms(),
    listRawPresets(),
  ])

  const formsInProject = forms.filter(
    f => f.projectId === projectId && f.deletedAt == null,
  )
  const formIds = new Set(formsInProject.map(f => f.id))

  let nextForms = forms
  let nextPresets = presets

  if (mode === 'delete-contents') {
    nextForms = forms.map(f =>
      formIds.has(f.id) ? { ...f, deletedAt: now, updatedAt: now } : f,
    )
    nextPresets = presets.map((p) => {
      const isInDeletedForm = p.formId != null && formIds.has(p.formId)
      const isStandaloneInProject
        = p.formId == null && p.projectId === projectId
      return isInDeletedForm || isStandaloneInProject
        ? { ...p, deletedAt: now, updatedAt: now }
        : p
    })
  }
  else {
    nextForms = forms.map(f =>
      formIds.has(f.id) ? { ...f, projectId: null, updatedAt: now } : f,
    )
    nextPresets = presets.map(p =>
      p.formId == null && p.projectId === projectId
        ? { ...p, projectId: null, updatedAt: now }
        : p,
    )
  }

  const nextProjects = projects.map(p =>
    p.id === projectId ? { ...p, deletedAt: now, updatedAt: now } : p,
  )

  await Promise.all([
    saveProjects(nextProjects),
    saveForms(nextForms),
    savePresets(nextPresets),
  ])
}

export async function upsertForm(form: FormDef): Promise<void> {
  const list = await listRawForms()
  const idx = list.findIndex(f => f.id === form.id)
  if (idx >= 0)
    list[idx] = form
  else list.push(form)
  await saveForms(list)
}

export async function deleteForm(
  formId: string,
  mode: 'delete-steps' | 'detach-steps',
): Promise<void> {
  const now = Date.now()
  const [forms, presets] = await Promise.all([
    listRawForms(),
    listRawPresets(),
  ])
  const targetForm = forms.find(f => f.id === formId)

  const nextForms = forms.map(f =>
    f.id === formId ? { ...f, deletedAt: now, updatedAt: now } : f,
  )

  let nextPresets: Preset[]
  if (mode === 'delete-steps') {
    nextPresets = presets.map(p =>
      p.formId === formId ? { ...p, deletedAt: now, updatedAt: now } : p,
    )
  }
  else {
    nextPresets = presets.map(p =>
      p.formId === formId && p.deletedAt == null
        ? {
            ...p,
            formId: null,
            stepOrder: null,
            projectId: targetForm?.projectId ?? null,
            updatedAt: now,
          }
        : p,
    )
  }

  await Promise.all([saveForms(nextForms), savePresets(nextPresets)])
}

export async function upsertPreset(preset: Preset): Promise<void> {
  const list = await listRawPresets()
  const idx = list.findIndex(p => p.id === preset.id)
  if (idx >= 0)
    list[idx] = preset
  else list.push(preset)
  await savePresets(renumberStepsForChangedPreset(list, preset))
}

export async function deletePreset(presetId: string): Promise<void> {
  const now = Date.now()
  const list = await listRawPresets()
  const target = list.find(p => p.id === presetId)
  const next = list.map(p =>
    p.id === presetId ? { ...p, deletedAt: now, updatedAt: now } : p,
  )
  if (target?.formId) {
    await savePresets(renumberStepsForForm(next, target.formId))
  }
  else {
    await savePresets(next)
  }
}

export async function reorderSteps(
  formId: string,
  orderedStepIds: string[],
): Promise<void> {
  const now = Date.now()
  const presets = await listRawPresets()
  const order = new Map(orderedStepIds.map((id, i) => [id, i + 1]))
  const next = presets.map(p =>
    p.formId === formId && order.has(p.id)
      ? { ...p, stepOrder: order.get(p.id)!, updatedAt: now }
      : p,
  )
  await savePresets(renumberStepsForForm(next, formId))
}

function renumberStepsForChangedPreset(
  list: Preset[],
  changed: Preset,
): Preset[] {
  let next = list
  if (changed.formId)
    next = renumberStepsForForm(next, changed.formId)
  return next
}

function renumberStepsForForm(list: Preset[], formId: string): Preset[] {
  const liveSteps = list
    .filter(p => p.formId === formId && p.deletedAt == null)
    .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0))
  const now = Date.now()
  const newOrder = new Map<string, number>()
  liveSteps.forEach((s, i) => newOrder.set(s.id, i + 1))
  return list.map((p) => {
    const target = newOrder.get(p.id)
    if (target == null)
      return p
    if (p.stepOrder === target)
      return p
    return { ...p, stepOrder: target, updatedAt: now }
  })
}

export async function getAllData(): Promise<{
  projects: Project[]
  forms: FormDef[]
  presets: Preset[]
  settings: Settings
}> {
  const [projects, forms, presets, settings] = await Promise.all([
    listProjects(),
    listForms(),
    listPresets(),
    getSettings(),
  ])
  return { projects, forms, presets, settings }
}

export function onStorageChanged(callback: () => void): () => void {
  const handler = (
    _changes: Parameters<
      Parameters<typeof browser.storage.onChanged.addListener>[0]
    >[0],
    area: string,
  ) => {
    if (area === 'local')
      callback()
  }
  browser.storage.onChanged.addListener(handler)
  return () => browser.storage.onChanged.removeListener(handler)
}
