import {
  upsertForm,
  upsertPreset,
  upsertProject,
} from '../../shared/storage';
import type {
  CaptureResult,
  FormDef,
  Preset,
  Project,
} from '../../shared/types';
import {
  buildPreset,
  newForm,
  newProject,
  stepCountsByForm,
} from '../../ui/preset-helpers';
import { SaveForm, type SavePayload } from '../../ui/SaveForm';

interface Props {
  snapshot: CaptureResult;
  projects: Project[];
  forms: FormDef[];
  presets: Preset[];
  onSaved: (preset: Preset) => void;
  onCancel: () => void;
}

export function InlineSavePanel({
  snapshot,
  projects,
  forms,
  presets,
  onSaved,
  onCancel,
}: Props) {
  async function createProject(name: string): Promise<Project> {
    const p = newProject(name);
    await upsertProject(p);
    return p;
  }
  async function createForm(
    label: string,
    projectId: string | null,
  ): Promise<FormDef> {
    const f = newForm(label, projectId);
    await upsertForm(f);
    return f;
  }
  async function handleSave(payload: SavePayload) {
    const preset = buildPreset({
      label: payload.label,
      target: payload.target,
      fields: snapshot.fields,
      page: snapshot,
      existingPresets: presets,
    });
    await upsertPreset(preset);
    onSaved(preset);
  }

  return (
    <div className="flex flex-col gap-3 p-3 border border-indigo-200 bg-indigo-50/40 rounded">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-indigo-900">
          Save captured state
        </h2>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-700 text-base"
          onClick={onCancel}
          aria-label="Cancel"
        >
          ×
        </button>
      </div>
      <SaveForm
        fieldCount={snapshot.fields.length}
        projects={projects}
        forms={forms}
        stepCountsByForm={stepCountsByForm(presets)}
        onSave={handleSave}
        onCancel={onCancel}
        onCreateProject={createProject}
        onCreateForm={createForm}
      />
    </div>
  );
}
