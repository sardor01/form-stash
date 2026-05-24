import type { Project } from '../../shared/types'

export type ProjectFilterValue = 'all' | 'none' | string

interface Props {
  value: ProjectFilterValue
  projects: Project[]
  onChange: (next: ProjectFilterValue) => void
}

export function ProjectFilter({ value, projects, onChange }: Props) {
  return (
    <select
      className="border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
      value={value}
      onChange={e => onChange(e.target.value as ProjectFilterValue)}
    >
      <option value="all">All projects</option>
      {projects.map(p => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      <option value="none">No project</option>
    </select>
  )
}
