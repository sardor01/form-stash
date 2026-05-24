import { useEffect, useMemo, useState } from 'react';
import type { FormDef, Project } from '../shared/types';

export type SaveTarget =
  | { kind: 'standalone'; projectId: string | null }
  | { kind: 'step'; formId: string; stepOrder: number };

export interface SavePayload {
  label: string;
  target: SaveTarget;
}

interface Props {
  fieldCount: number;
  projects: Project[];
  forms: FormDef[];
  /** Existing presets used to compute the next step number for a form. */
  stepCountsByForm: Record<string, number>;
  initialLabel?: string;
  initialTarget?: SaveTarget;
  onSave: (payload: SavePayload) => Promise<void> | void;
  onCancel: () => void;
  onCreateProject: (name: string) => Promise<Project>;
  onCreateForm: (label: string, projectId: string | null) => Promise<FormDef>;
  /** Optional: "Continue submit" button visible when capture blocked the original submit. */
  showContinueSubmit?: boolean;
  onContinueSubmit?: () => void;
}

export function SaveForm({
  fieldCount,
  projects,
  forms,
  stepCountsByForm,
  initialLabel = '',
  initialTarget,
  onSave,
  onCancel,
  onCreateProject,
  onCreateForm,
  showContinueSubmit,
  onContinueSubmit,
}: Props) {
  const [label, setLabel] = useState(initialLabel);
  const [kind, setKind] = useState<'standalone' | 'step'>(
    initialTarget?.kind ?? 'standalone',
  );
  const [projectId, setProjectId] = useState<string | null>(
    initialTarget?.kind === 'standalone'
      ? initialTarget.projectId
      : (projects[0]?.id ?? null),
  );
  const [formId, setFormId] = useState<string | null>(
    initialTarget?.kind === 'step'
      ? initialTarget.formId
      : (forms[0]?.id ?? null),
  );
  const [stepOrder, setStepOrder] = useState<number>(
    initialTarget?.kind === 'step' ? initialTarget.stepOrder : 1,
  );
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingForm, setCreatingForm] = useState(false);
  const [newFormLabel, setNewFormLabel] = useState('');
  const [newFormProjectId, setNewFormProjectId] = useState<string | null>(
    projects[0]?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind === 'step' && formId) {
      const next = (stepCountsByForm[formId] ?? 0) + 1;
      setStepOrder(next);
    }
  }, [kind, formId, stepCountsByForm]);

  const formsForPicker = useMemo(() => forms, [forms]);

  async function handleSave() {
    setError(null);
    if (!label.trim()) {
      setError('Label is required');
      return;
    }
    setBusy(true);
    try {
      let target: SaveTarget;
      if (kind === 'standalone') {
        target = { kind: 'standalone', projectId };
      } else {
        if (!formId) {
          setError('Pick or create a form');
          setBusy(false);
          return;
        }
        target = { kind: 'step', formId, stepOrder };
      }
      await onSave({ label: label.trim(), target });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name) return;
    const project = await onCreateProject(name);
    setProjectId(project.id);
    setNewProjectName('');
    setCreatingProject(false);
  }

  async function handleCreateForm() {
    const lbl = newFormLabel.trim();
    if (!lbl) return;
    const form = await onCreateForm(lbl, newFormProjectId);
    setFormId(form.id);
    setNewFormLabel('');
    setCreatingForm(false);
  }

  return (
    <div className="fs-save-form flex flex-col gap-3 text-sm">
      <div className="text-slate-600">
        Capturing <strong>{fieldCount}</strong> field
        {fieldCount === 1 ? '' : 's'}
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Label</span>
        <input
          autoFocus
          className="border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Shipper details"
        />
      </label>

      <fieldset className="flex flex-col gap-2 border border-slate-200 rounded p-2">
        <legend className="text-xs text-slate-500 px-1">Save as</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="fs-save-kind"
            checked={kind === 'standalone'}
            onChange={() => setKind('standalone')}
          />
          <span>Standalone preset</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="fs-save-kind"
            checked={kind === 'step'}
            onChange={() => setKind('step')}
          />
          <span>Step of a form</span>
        </label>
      </fieldset>

      {kind === 'standalone' ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-medium">Project</span>
            <select
              className="border border-slate-300 rounded px-2 py-1"
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value || null)}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {creatingProject ? (
            <div className="flex gap-2">
              <input
                className="border border-slate-300 rounded px-2 py-1 flex-1"
                placeholder="New project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
              <button
                type="button"
                className="px-2 py-1 bg-indigo-600 text-white rounded text-xs"
                onClick={handleCreateProject}
              >
                Add
              </button>
              <button
                type="button"
                className="px-2 py-1 text-slate-500 text-xs"
                onClick={() => setCreatingProject(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-indigo-600 text-xs self-start"
              onClick={() => setCreatingProject(true)}
            >
              ➕ Create new project…
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-medium">Form</span>
            <select
              className="border border-slate-300 rounded px-2 py-1"
              value={formId ?? ''}
              onChange={(e) => setFormId(e.target.value || null)}
            >
              <option value="">— pick a form —</option>
              {formsForPicker.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          {creatingForm ? (
            <div className="flex flex-col gap-2 border border-slate-200 p-2 rounded">
              <input
                className="border border-slate-300 rounded px-2 py-1"
                placeholder="New form label"
                value={newFormLabel}
                onChange={(e) => setNewFormLabel(e.target.value)}
              />
              <select
                className="border border-slate-300 rounded px-2 py-1"
                value={newFormProjectId ?? ''}
                onChange={(e) =>
                  setNewFormProjectId(e.target.value || null)
                }
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-2 py-1 bg-indigo-600 text-white rounded text-xs"
                  onClick={handleCreateForm}
                >
                  Create form
                </button>
                <button
                  type="button"
                  className="px-2 py-1 text-slate-500 text-xs"
                  onClick={() => setCreatingForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="text-indigo-600 text-xs self-start"
              onClick={() => setCreatingForm(true)}
            >
              ➕ Create new form…
            </button>
          )}
          <label className="flex flex-col gap-1">
            <span className="font-medium">Step #</span>
            <input
              type="number"
              min={1}
              className="border border-slate-300 rounded px-2 py-1 w-24"
              value={stepOrder}
              onChange={(e) =>
                setStepOrder(
                  Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                )
              }
            />
          </label>
        </div>
      )}

      {error && <div className="text-rose-600 text-xs">{error}</div>}

      <div className="flex gap-2 mt-1">
        <button
          type="button"
          className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm disabled:opacity-50"
          disabled={busy}
          onClick={handleSave}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="px-3 py-1.5 text-slate-600 text-sm"
          onClick={onCancel}
          disabled={busy}
        >
          Dismiss
        </button>
        {showContinueSubmit && onContinueSubmit && (
          <button
            type="button"
            className="px-3 py-1.5 text-slate-600 text-sm ml-auto"
            onClick={onContinueSubmit}
          >
            Continue submit ▸
          </button>
        )}
      </div>
    </div>
  );
}
