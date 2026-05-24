import { useState } from 'react';
import {
  deleteForm,
  deleteProject,
  upsertForm,
  upsertProject,
} from '../../shared/storage';
import type { FormDef, Project } from '../../shared/types';
import { newForm, newProject } from '../../ui/preset-helpers';

interface Props {
  projects: Project[];
  forms: FormDef[];
  onClose: () => void;
}

export function ManagePanel({ projects, forms, onClose }: Props) {
  const [newProjectName, setNewProjectName] = useState('');
  const [newFormLabel, setNewFormLabel] = useState('');
  const [newFormProjectId, setNewFormProjectId] = useState<string | null>(null);

  async function addProject() {
    const name = newProjectName.trim();
    if (!name) return;
    await upsertProject(newProject(name));
    setNewProjectName('');
  }

  async function addForm() {
    const lbl = newFormLabel.trim();
    if (!lbl) return;
    await upsertForm(newForm(lbl, newFormProjectId));
    setNewFormLabel('');
  }

  async function renameProject(p: Project) {
    const name = window.prompt('Rename project', p.name);
    if (name && name.trim() && name !== p.name) {
      await upsertProject({ ...p, name: name.trim() });
    }
  }

  async function removeProject(p: Project) {
    const choice = window.prompt(
      `Delete project "${p.name}"?\nType "delete" to remove its forms/presets, or "unassign" to move them to No project.`,
      'unassign',
    );
    if (choice === 'delete') {
      await deleteProject(p.id, 'delete-contents');
    } else if (choice === 'unassign') {
      await deleteProject(p.id, 'unassign');
    }
  }

  async function renameForm(f: FormDef) {
    const label = window.prompt('Rename form', f.label);
    if (label && label.trim() && label !== f.label) {
      await upsertForm({ ...f, label: label.trim(), updatedAt: Date.now() });
    }
  }

  async function moveForm(f: FormDef) {
    const ids = ['(none)', ...projects.map((p) => p.id)];
    const labels = ['No project', ...projects.map((p) => p.name)];
    const choice = window.prompt(
      `Move "${f.label}" to which project?\n${ids
        .map((id, i) => `${i}: ${labels[i]}`)
        .join('\n')}`,
      '0',
    );
    if (!choice) return;
    const idx = Number.parseInt(choice, 10);
    if (Number.isNaN(idx) || idx < 0 || idx >= ids.length) return;
    const projectId = idx === 0 ? null : ids[idx];
    await upsertForm({ ...f, projectId, updatedAt: Date.now() });
  }

  async function removeForm(f: FormDef) {
    const choice = window.prompt(
      `Delete form "${f.label}"?\nType "delete" to remove its steps, or "detach" to keep them as standalone presets.`,
      'detach',
    );
    if (choice === 'delete') {
      await deleteForm(f.id, 'delete-steps');
    } else if (choice === 'detach') {
      await deleteForm(f.id, 'detach-steps');
    }
  }

  return (
    <div className="flex flex-col gap-4 p-3 border border-slate-200 rounded bg-white">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Manage projects & forms</h2>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-700 text-base"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase text-slate-500">
          Projects
        </h3>
        <ul className="flex flex-col gap-1">
          {projects.length === 0 && (
            <li className="text-xs text-slate-400">No projects yet.</li>
          )}
          {projects.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 border border-slate-200 rounded px-2 py-1"
            >
              <span className="text-sm flex-1 truncate">{p.name}</span>
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={() => renameProject(p)}
              >
                Rename
              </button>
              <button
                type="button"
                className="text-xs text-rose-600"
                onClick={() => removeProject(p)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className="border border-slate-300 rounded px-2 py-1 text-sm flex-1"
            placeholder="New project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
          />
          <button
            type="button"
            className="px-2 py-1 bg-indigo-600 text-white text-xs rounded"
            onClick={addProject}
          >
            Add
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase text-slate-500">
          Forms
        </h3>
        <ul className="flex flex-col gap-1">
          {forms.length === 0 && (
            <li className="text-xs text-slate-400">No forms yet.</li>
          )}
          {forms.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 border border-slate-200 rounded px-2 py-1"
            >
              <span className="text-sm flex-1 truncate">{f.label}</span>
              <span className="text-[10px] text-slate-400">
                {projects.find((p) => p.id === f.projectId)?.name ?? 'No project'}
              </span>
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={() => renameForm(f)}
              >
                Rename
              </button>
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={() => moveForm(f)}
              >
                Move
              </button>
              <button
                type="button"
                className="text-xs text-rose-600"
                onClick={() => removeForm(f)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 items-center">
          <input
            className="border border-slate-300 rounded px-2 py-1 text-sm flex-1"
            placeholder="New form label"
            value={newFormLabel}
            onChange={(e) => setNewFormLabel(e.target.value)}
          />
          <select
            className="border border-slate-300 rounded px-2 py-1 text-xs"
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
          <button
            type="button"
            className="px-2 py-1 bg-indigo-600 text-white text-xs rounded"
            onClick={addForm}
          >
            Add
          </button>
        </div>
      </section>
    </div>
  );
}
