import type {
  FieldSnapshot,
  FormDef,
  Preset,
  Project,
} from '../../shared/types'
import type { SavePayload } from '../../ui/SaveForm'
import { useEffect, useState } from 'react'
import {
  listForms,
  listPresets,
  listProjects,
  upsertForm,
  upsertPreset,
  upsertProject,
} from '../../shared/storage'
import {
  buildPreset,
  newForm,
  newProject,
  stepCountsByForm,
} from '../../ui/preset-helpers'
import { SaveForm } from '../../ui/SaveForm'

export interface ModalSnapshot {
  fields: FieldSnapshot[]
  url: string
  origin: string
  path: string
}

export interface SaveModalAppProps {
  snapshot: ModalSnapshot
  onClose: () => void
  onSaved: (preset: Preset) => void
  showContinueSubmit?: boolean
  onContinueSubmit?: () => void
}

export function SaveModalApp({
  snapshot,
  onClose,
  onSaved,
  showContinueSubmit,
  onContinueSubmit,
}: SaveModalAppProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [forms, setForms] = useState<FormDef[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([listProjects(), listForms(), listPresets()]).then(
      ([p, f, pr]) => {
        if (cancelled)
          return
        setProjects(p)
        setForms(f)
        setPresets(pr)
        setLoaded(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  async function createProject(name: string): Promise<Project> {
    const p = newProject(name)
    await upsertProject(p)
    setProjects(prev => [...prev, p])
    return p
  }

  async function createForm(
    label: string,
    projectId: string | null,
  ): Promise<FormDef> {
    const f = newForm(label, projectId)
    await upsertForm(f)
    setForms(prev => [...prev, f])
    return f
  }

  async function handleSave(payload: SavePayload) {
    const preset = buildPreset({
      label: payload.label,
      target: payload.target,
      fields: snapshot.fields,
      page: snapshot,
      existingPresets: presets,
    })
    await upsertPreset(preset)
    onSaved(preset)
    onClose()
  }

  return (
    <div className="fs-modal-backdrop fixed inset-0 z-[2147483646] bg-slate-900/40 flex items-start justify-center p-8">
      <div
        className="fs-modal bg-white text-slate-800 rounded-lg shadow-2xl w-[420px] max-w-[90vw] p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">
            Save form state as a preset
          </h2>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-700 text-lg leading-none"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {loaded
          ? (
              <SaveForm
                fieldCount={snapshot.fields.length}
                projects={projects}
                forms={forms}
                stepCountsByForm={stepCountsByForm(presets)}
                onSave={handleSave}
                onCancel={onClose}
                onCreateProject={createProject}
                onCreateForm={createForm}
                showContinueSubmit={showContinueSubmit}
                onContinueSubmit={onContinueSubmit}
              />
            )
          : (
              <div className="text-slate-500 text-sm">Loading…</div>
            )}
      </div>
    </div>
  )
}
