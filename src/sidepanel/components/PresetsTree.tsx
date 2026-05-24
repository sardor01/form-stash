import { useMemo, useState } from 'react';
import type {
  FormDef,
  PageInfo,
  Preset,
  Project,
} from '../../shared/types';
import { projectIdFor } from '../../ui/preset-helpers';
import type { ProjectFilterValue } from './ProjectFilter';

interface Props {
  projects: Project[];
  forms: FormDef[];
  presets: Preset[];
  pageInfo: PageInfo | null;
  search: string;
  projectFilter: ProjectFilterValue;
  onApply: (preset: Preset) => void;
  onEdit: (preset: Preset) => void;
  onDuplicate: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
  onRecapture: (preset: Preset) => void;
  onRenameForm: (form: FormDef) => void;
  onDeleteForm: (form: FormDef) => void;
  onAddStepFromCurrentPage: (form: FormDef) => void;
  onMoveStepUp: (preset: Preset) => void;
  onMoveStepDown: (preset: Preset) => void;
}

interface Group {
  projectId: string | null;
  projectLabel: string;
  forms: { form: FormDef; steps: Preset[] }[];
  standalone: Preset[];
}

export function PresetsTree(props: Props) {
  const {
    projects,
    forms,
    presets,
    pageInfo,
    search,
    projectFilter,
    onApply,
    onEdit,
    onDuplicate,
    onDelete,
    onRecapture,
    onRenameForm,
    onDeleteForm,
    onAddStepFromCurrentPage,
    onMoveStepUp,
    onMoveStepDown,
  } = props;

  const groups = useMemo(
    () => groupPresets(projects, forms, presets),
    [projects, forms, presets],
  );

  const filtered = useMemo(
    () => filterGroups(groups, search.trim().toLowerCase(), projectFilter),
    [groups, search, projectFilter],
  );

  return (
    <div className="flex flex-col gap-2">
      {filtered.length === 0 && (
        <div className="text-slate-500 text-sm p-3 text-center">
          No presets match your filter.
        </div>
      )}
      {filtered.map((group) => (
        <GroupSection
          key={group.projectId ?? '__none__'}
          group={group}
          pageInfo={pageInfo}
          onApply={onApply}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onRecapture={onRecapture}
          onRenameForm={onRenameForm}
          onDeleteForm={onDeleteForm}
          onAddStepFromCurrentPage={onAddStepFromCurrentPage}
          onMoveStepUp={onMoveStepUp}
          onMoveStepDown={onMoveStepDown}
        />
      ))}
    </div>
  );
}

interface GroupSectionProps extends Omit<Props, 'projects' | 'forms' | 'presets' | 'search' | 'projectFilter'> {
  group: Group;
}

function GroupSection({
  group,
  pageInfo,
  onApply,
  onEdit,
  onDuplicate,
  onDelete,
  onRecapture,
  onRenameForm,
  onDeleteForm,
  onAddStepFromCurrentPage,
  onMoveStepUp,
  onMoveStepDown,
}: GroupSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const hasMatch = group.forms.some((f) =>
    f.steps.some((s) => matchesPage(s, pageInfo)),
  ) || group.standalone.some((p) => matchesPage(p, pageInfo));

  return (
    <div
      className={`border rounded ${hasMatch ? 'border-emerald-300' : 'border-slate-200'} bg-white`}
    >
      <button
        type="button"
        className="w-full text-left px-2 py-1.5 text-xs uppercase tracking-wide text-slate-500 hover:bg-slate-50 flex items-center gap-1.5"
        onClick={() => setExpanded((v) => !v)}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span className="font-semibold">{group.projectLabel}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 flex flex-col gap-1.5">
          {group.forms.map(({ form, steps }) => (
            <FormBlock
              key={form.id}
              form={form}
              steps={steps}
              pageInfo={pageInfo}
              onApply={onApply}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onRecapture={onRecapture}
              onRenameForm={onRenameForm}
              onDeleteForm={onDeleteForm}
              onAddStepFromCurrentPage={onAddStepFromCurrentPage}
              onMoveStepUp={onMoveStepUp}
              onMoveStepDown={onMoveStepDown}
            />
          ))}
          {group.standalone.map((preset) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              pageInfo={pageInfo}
              onApply={onApply}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onRecapture={onRecapture}
            />
          ))}
          {group.forms.length === 0 && group.standalone.length === 0 && (
            <div className="text-xs text-slate-400 px-1">(empty)</div>
          )}
        </div>
      )}
    </div>
  );
}

interface FormBlockProps {
  form: FormDef;
  steps: Preset[];
  pageInfo: PageInfo | null;
  onApply: (preset: Preset) => void;
  onEdit: (preset: Preset) => void;
  onDuplicate: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
  onRecapture: (preset: Preset) => void;
  onRenameForm: (form: FormDef) => void;
  onDeleteForm: (form: FormDef) => void;
  onAddStepFromCurrentPage: (form: FormDef) => void;
  onMoveStepUp: (preset: Preset) => void;
  onMoveStepDown: (preset: Preset) => void;
}

function FormBlock({
  form,
  steps,
  pageInfo,
  onApply,
  onEdit,
  onDuplicate,
  onDelete,
  onRecapture,
  onRenameForm,
  onDeleteForm,
  onAddStepFromCurrentPage,
  onMoveStepUp,
  onMoveStepDown,
}: FormBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const hasMatch = steps.some((s) => matchesPage(s, pageInfo));

  return (
    <div
      className={`border rounded ${hasMatch ? 'border-emerald-300' : 'border-slate-200'} bg-slate-50/40`}
    >
      <div className="px-2 py-1.5 flex items-center gap-2">
        <button
          type="button"
          className="text-slate-500"
          onClick={() => setExpanded((v) => !v)}
          aria-label="Toggle form"
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div className="font-medium text-sm flex-1 truncate" title={form.label}>
          {form.label}
        </div>
        <span className="text-xs text-slate-500">
          {steps.length} step{steps.length === 1 ? '' : 's'}
        </span>
        <div className="flex gap-1">
          <IconButton
            label="Add step from current page"
            onClick={() => onAddStepFromCurrentPage(form)}
          >
            ➕
          </IconButton>
          <IconButton label="Rename" onClick={() => onRenameForm(form)}>
            ✏️
          </IconButton>
          <IconButton label="Delete form" onClick={() => onDeleteForm(form)}>
            🗑
          </IconButton>
        </div>
      </div>
      {expanded && (
        <div className="px-2 pb-2 flex flex-col gap-1">
          {steps.length === 0 && (
            <div className="text-xs text-slate-400 px-1">(no steps yet)</div>
          )}
          {steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              index={i}
              total={steps.length}
              pageInfo={pageInfo}
              onApply={onApply}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onRecapture={onRecapture}
              onMoveUp={onMoveStepUp}
              onMoveDown={onMoveStepDown}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PresetRow({
  preset,
  pageInfo,
  onApply,
  onEdit,
  onDuplicate,
  onDelete,
  onRecapture,
}: {
  preset: Preset;
  pageInfo: PageInfo | null;
  onApply: (p: Preset) => void;
  onEdit: (p: Preset) => void;
  onDuplicate: (p: Preset) => void;
  onDelete: (p: Preset) => void;
  onRecapture: (p: Preset) => void;
}) {
  const matches = matchesPage(preset, pageInfo);
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded border ${matches ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" title={preset.label}>
          {preset.label}
          {matches && (
            <span className="ml-2 text-[10px] uppercase text-emerald-700 font-semibold">
              matches this page
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-500 truncate" title={preset.url}>
          {preset.fields.length} field{preset.fields.length === 1 ? '' : 's'} ·{' '}
          {preset.path || preset.url}
        </div>
      </div>
      <button
        type="button"
        className="px-2 py-1 text-xs bg-indigo-600 text-white rounded"
        onClick={() => onApply(preset)}
      >
        Apply ▸
      </button>
      <RowMenu>
        <MenuItem onClick={() => onEdit(preset)}>Edit</MenuItem>
        <MenuItem onClick={() => onDuplicate(preset)}>Duplicate</MenuItem>
        <MenuItem onClick={() => onRecapture(preset)}>Re-capture</MenuItem>
        <MenuItem onClick={() => onDelete(preset)} danger>
          Delete
        </MenuItem>
      </RowMenu>
    </div>
  );
}

function StepRow({
  step,
  index,
  total,
  pageInfo,
  onApply,
  onEdit,
  onDuplicate,
  onDelete,
  onRecapture,
  onMoveUp,
  onMoveDown,
}: {
  step: Preset;
  index: number;
  total: number;
  pageInfo: PageInfo | null;
  onApply: (p: Preset) => void;
  onEdit: (p: Preset) => void;
  onDuplicate: (p: Preset) => void;
  onDelete: (p: Preset) => void;
  onRecapture: (p: Preset) => void;
  onMoveUp: (p: Preset) => void;
  onMoveDown: (p: Preset) => void;
}) {
  const matches = matchesPage(step, pageInfo);
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded border ${matches ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}
    >
      <span className="text-xs text-slate-500 w-6 shrink-0">
        {step.stepOrder ?? index + 1}.
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" title={step.label}>
          {step.label}
          {matches && (
            <span className="ml-2 text-[10px] uppercase text-emerald-700 font-semibold">
              matches this page
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-500 truncate" title={step.url}>
          {step.fields.length} field{step.fields.length === 1 ? '' : 's'} ·{' '}
          {step.path || step.url}
        </div>
      </div>
      <div className="flex flex-col">
        <button
          type="button"
          className="text-[10px] text-slate-400 hover:text-slate-700 leading-none"
          onClick={() => onMoveUp(step)}
          disabled={index === 0}
          aria-label="Move up"
        >
          ▲
        </button>
        <button
          type="button"
          className="text-[10px] text-slate-400 hover:text-slate-700 leading-none"
          onClick={() => onMoveDown(step)}
          disabled={index === total - 1}
          aria-label="Move down"
        >
          ▼
        </button>
      </div>
      <button
        type="button"
        className="px-2 py-1 text-xs bg-indigo-600 text-white rounded"
        onClick={() => onApply(step)}
      >
        Apply ▸
      </button>
      <RowMenu>
        <MenuItem onClick={() => onEdit(step)}>Edit</MenuItem>
        <MenuItem onClick={() => onDuplicate(step)}>Duplicate</MenuItem>
        <MenuItem onClick={() => onRecapture(step)}>Re-capture</MenuItem>
        <MenuItem onClick={() => onDelete(step)} danger>
          Delete
        </MenuItem>
      </RowMenu>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="text-xs px-1.5 py-0.5 hover:bg-slate-200 rounded"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function RowMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className="text-slate-500 px-1 hover:text-slate-800"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-10 bg-white border border-slate-200 rounded shadow-lg py-1 min-w-[120px]"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`block w-full text-left px-3 py-1 text-xs hover:bg-slate-50 ${danger ? 'text-rose-600' : 'text-slate-700'}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function matchesPage(preset: Preset, pageInfo: PageInfo | null): boolean {
  if (!pageInfo) return false;
  return preset.origin === pageInfo.origin && preset.path === pageInfo.path;
}

function groupPresets(
  projects: Project[],
  forms: FormDef[],
  presets: Preset[],
): Group[] {
  const out: Group[] = [];
  const projectsMap = new Map(projects.map((p) => [p.id, p]));

  const projectIds = new Set<string | null>();
  projects.forEach((p) => projectIds.add(p.id));
  forms.forEach((f) => projectIds.add(f.projectId));
  presets.forEach((p) => projectIds.add(projectIdFor(p, forms)));

  const sortedProjectIds = [...projectIds].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    const na = projectsMap.get(a)?.name ?? '';
    const nb = projectsMap.get(b)?.name ?? '';
    return na.localeCompare(nb);
  });

  for (const projectId of sortedProjectIds) {
    const formsInProject = forms
      .filter((f) => f.projectId === projectId)
      .map((form) => ({
        form,
        steps: presets
          .filter((p) => p.formId === form.id)
          .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0)),
      }))
      .sort((a, b) => a.form.label.localeCompare(b.form.label));

    const standaloneInProject = presets
      .filter((p) => p.formId === null && p.projectId === projectId)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (formsInProject.length === 0 && standaloneInProject.length === 0) {
      continue;
    }

    out.push({
      projectId,
      projectLabel:
        projectId === null
          ? 'No project'
          : (projectsMap.get(projectId)?.name ?? 'Unknown project'),
      forms: formsInProject,
      standalone: standaloneInProject,
    });
  }

  return out;
}

function filterGroups(
  groups: Group[],
  search: string,
  projectFilter: ProjectFilterValue,
): Group[] {
  return groups
    .filter((g) => {
      if (projectFilter === 'all') return true;
      if (projectFilter === 'none') return g.projectId === null;
      return g.projectId === projectFilter;
    })
    .map((g) => filterGroup(g, search))
    .filter(
      (g) => g.forms.length > 0 || g.standalone.length > 0,
    );
}

function filterGroup(g: Group, search: string): Group {
  if (!search) return g;
  const matches = (text: string) => text.toLowerCase().includes(search);
  const groupMatches = matches(g.projectLabel);
  const forms = g.forms
    .map((entry) => {
      const formMatches = matches(entry.form.label);
      const steps = entry.steps.filter(
        (s) =>
          groupMatches ||
          formMatches ||
          matches(s.label) ||
          matches(s.path),
      );
      if (formMatches && steps.length === 0) return { ...entry, steps };
      return { ...entry, steps };
    })
    .filter(
      (entry) =>
        groupMatches ||
        matches(entry.form.label) ||
        entry.steps.length > 0,
    );
  const standalone = g.standalone.filter(
    (p) => groupMatches || matches(p.label) || matches(p.path),
  );
  return { ...g, forms, standalone };
}
