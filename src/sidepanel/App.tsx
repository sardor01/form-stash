import { useCallback, useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { getActiveTab, sendToTab } from '../shared/messaging';
import {
  deleteForm,
  deletePreset,
  listPresets,
  reorderSteps,
  upsertForm,
  upsertPreset,
} from '../shared/storage';
import type {
  CandidateForm,
  CaptureResult,
  FillReport,
  FormDef,
  PageInfo,
  Preset,
  Project,
} from '../shared/types';
import { CandidatePicker } from './components/CandidatePicker';
import { CaptureButton } from './components/CaptureButton';
import { FillReportView } from './components/FillReportView';
import { InlineSavePanel } from './components/InlineSavePanel';
import { ManagePanel } from './components/ManagePanel';
import { PresetsTree } from './components/PresetsTree';
import {
  ProjectFilter,
  type ProjectFilterValue,
} from './components/ProjectFilter';
import { SearchBar } from './components/SearchBar';
import { SettingsPanel } from './components/SettingsPanel';
import { SyncPanel } from './components/SyncPanel';
import { useActiveTabInfo, useStore } from './hooks';

type View =
  | { kind: 'browse' }
  | { kind: 'pick-candidate'; candidates: CandidateForm[]; intent: CaptureIntent }
  | { kind: 'save'; snapshot: CaptureResult; intent: CaptureIntent }
  | { kind: 'report'; report: FillReport; preset: Preset }
  | { kind: 'manage' }
  | { kind: 'sync' }
  | { kind: 'settings' };

type CaptureIntent =
  | { mode: 'fresh' }
  | { mode: 'recapture'; overwriting: Preset }
  | { mode: 'add-step'; form: FormDef };

export function App() {
  const store = useStore();
  const pageInfo = useActiveTabInfo();
  const [view, setView] = useState<View>({ kind: 'browse' });
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<ProjectFilterValue>('all');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const reset = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(reset);
  }, [error]);

  const startCapture = useCallback(
    async (intent: CaptureIntent, candidateIndex?: number) => {
      setBusy(true);
      setError(null);
      try {
        const tab = await getActiveTab();
        if (!tab?.id) throw new Error('No active tab');
        const result = await sendToTab(tab.id, {
          kind: 'CAPTURE_NOW',
          candidateIndex,
        });
        if (result.candidates && result.candidates.length > 1) {
          setView({
            kind: 'pick-candidate',
            candidates: result.candidates,
            intent,
          });
          return;
        }
        if (result.fields.length === 0) {
          setError('No fields detected on this page.');
          setView({ kind: 'browse' });
          return;
        }
        setView({ kind: 'save', snapshot: result, intent });
      } catch (e) {
        setError(toMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const applyPresetNow = useCallback(async (preset: Preset) => {
    setBusy(true);
    setError(null);
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('No active tab');
      const report = await sendToTab(tab.id, {
        kind: 'APPLY_PRESET',
        preset,
      });
      setView({ kind: 'report', report, preset });
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  async function handleSaved(preset: Preset, intent: CaptureIntent) {
    if (intent.mode === 'recapture') {
      const overwriting = intent.overwriting;
      const replacement: Preset = {
        ...preset,
        id: overwriting.id,
        createdAt: overwriting.createdAt,
        formId: overwriting.formId,
        stepOrder: overwriting.stepOrder,
        projectId: overwriting.projectId,
      };
      await upsertPreset(replacement);
    } else if (intent.mode === 'add-step') {
      const stepsForForm = (await listPresets()).filter(
        (p) => p.formId === intent.form.id,
      );
      const replacement: Preset = {
        ...preset,
        formId: intent.form.id,
        stepOrder: stepsForForm.length,
        projectId: null,
      };
      await upsertPreset(replacement);
    }
    setView({ kind: 'browse' });
  }

  async function handleDuplicate(preset: Preset) {
    const copy: Preset = {
      ...preset,
      id: uuid(),
      label: `${preset.label} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      formId: null,
      stepOrder: null,
      projectId: preset.projectId,
    };
    await upsertPreset(copy);
  }

  async function handleDelete(preset: Preset) {
    if (!window.confirm(`Delete preset "${preset.label}"?`)) return;
    await deletePreset(preset.id);
  }

  async function handleEdit(preset: Preset) {
    const newLabel = window.prompt('Rename preset', preset.label);
    if (!newLabel || newLabel === preset.label) return;
    await upsertPreset({
      ...preset,
      label: newLabel.trim(),
      updatedAt: Date.now(),
    });
  }

  async function handleRenameForm(form: FormDef) {
    const next = window.prompt('Rename form', form.label);
    if (!next || next === form.label) return;
    await upsertForm({ ...form, label: next.trim(), updatedAt: Date.now() });
  }

  async function handleDeleteForm(form: FormDef) {
    const choice = window.prompt(
      `Delete "${form.label}"?\nType "delete" to remove its steps, or "detach" to keep them as standalone presets.`,
      'detach',
    );
    if (!choice) return;
    if (choice === 'delete') await deleteForm(form.id, 'delete-steps');
    else if (choice === 'detach') await deleteForm(form.id, 'detach-steps');
  }

  async function moveStep(preset: Preset, delta: -1 | 1) {
    if (!preset.formId) return;
    const stepsForForm = (await listPresets())
      .filter((p) => p.formId === preset.formId)
      .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
    const idx = stepsForForm.findIndex((s) => s.id === preset.id);
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= stepsForForm.length) return;
    const reordered = [...stepsForForm];
    const [removed] = reordered.splice(idx, 1);
    reordered.splice(nextIdx, 0, removed);
    await reorderSteps(preset.formId, reordered.map((s) => s.id));
  }

  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      <Header
        store={store}
        pageInfo={pageInfo}
        view={view}
        setView={setView}
        busy={busy}
        onCapture={() => startCapture({ mode: 'fresh' })}
        search={search}
        setSearch={setSearch}
        projectFilter={projectFilter}
        setProjectFilter={setProjectFilter}
      />

      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      {view.kind === 'pick-candidate' && (
        <CandidatePicker
          candidates={view.candidates}
          onPick={(idx) => startCapture(view.intent, idx)}
          onCancel={() => setView({ kind: 'browse' })}
        />
      )}

      {view.kind === 'save' && (
        <InlineSavePanel
          snapshot={view.snapshot}
          projects={store.projects}
          forms={store.forms}
          presets={store.presets}
          onSaved={(preset) => handleSaved(preset, view.intent)}
          onCancel={() => setView({ kind: 'browse' })}
        />
      )}

      {view.kind === 'report' && (
        <FillReportView
          report={view.report}
          onClose={() => setView({ kind: 'browse' })}
        />
      )}

      {view.kind === 'manage' && (
        <ManagePanel
          projects={store.projects}
          forms={store.forms}
          onClose={() => setView({ kind: 'browse' })}
        />
      )}

      {view.kind === 'settings' && (
        <SettingsPanel onClose={() => setView({ kind: 'browse' })} />
      )}

      {view.kind === 'sync' && (
        <SyncPanel onClose={() => setView({ kind: 'browse' })} />
      )}

      {(view.kind === 'browse' ||
        view.kind === 'save' ||
        view.kind === 'report' ||
        view.kind === 'sync') &&
        store.loaded && (
          <div className="flex-1 overflow-auto">
            <PresetsTree
              projects={store.projects}
              forms={store.forms}
              presets={store.presets}
              pageInfo={pageInfo}
              search={search}
              projectFilter={projectFilter}
              onApply={applyPresetNow}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onRecapture={(preset) =>
                startCapture({ mode: 'recapture', overwriting: preset })
              }
              onRenameForm={handleRenameForm}
              onDeleteForm={handleDeleteForm}
              onAddStepFromCurrentPage={(form) =>
                startCapture({ mode: 'add-step', form })
              }
              onMoveStepUp={(p) => moveStep(p, -1)}
              onMoveStepDown={(p) => moveStep(p, 1)}
            />
          </div>
        )}
    </div>
  );
}

interface HeaderProps {
  store: ReturnType<typeof useStore>;
  pageInfo: PageInfo | null;
  view: View;
  setView: (v: View) => void;
  busy: boolean;
  onCapture: () => void;
  search: string;
  setSearch: (s: string) => void;
  projectFilter: ProjectFilterValue;
  setProjectFilter: (v: ProjectFilterValue) => void;
}

function Header({
  store,
  pageInfo,
  view,
  setView,
  busy,
  onCapture,
  search,
  setSearch,
  projectFilter,
  setProjectFilter,
}: HeaderProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-200 pb-3">
      <div className="flex items-center gap-2">
        <CaptureButton onClick={onCapture} busy={busy} />
        <div className="ml-auto flex gap-1">
          <HeaderButton
            active={view.kind === 'sync'}
            onClick={() =>
              setView(
                view.kind === 'sync' ? { kind: 'browse' } : { kind: 'sync' },
              )
            }
            label="Cloud sync"
          >
            ☁️
          </HeaderButton>
          <HeaderButton
            active={view.kind === 'manage'}
            onClick={() =>
              setView(
                view.kind === 'manage'
                  ? { kind: 'browse' }
                  : { kind: 'manage' },
              )
            }
            label="Manage projects and forms"
          >
            ⚙️
          </HeaderButton>
          <HeaderButton
            active={view.kind === 'settings'}
            onClick={() =>
              setView(
                view.kind === 'settings'
                  ? { kind: 'browse' }
                  : { kind: 'settings' },
              )
            }
            label="Capture settings"
          >
            🛠
          </HeaderButton>
        </div>
      </div>
      {pageInfo && pageInfo.url && (
        <div
          className="text-[11px] text-slate-500 truncate"
          title={pageInfo.url}
        >
          {pageInfo.title || pageInfo.path}
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} />
        </div>
        <ProjectFilter
          value={projectFilter}
          projects={store.projects}
          onChange={setProjectFilter}
        />
      </div>
      {store.loaded && store.presets.length === 0 && (
        <div className="text-xs text-slate-500">
          No presets yet — fill a form, then click <strong>Capture this page</strong> or
          submit to save your first preset.
        </div>
      )}
    </div>
  );
}

function HeaderButton({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`px-2 py-1 text-base rounded ${active ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
