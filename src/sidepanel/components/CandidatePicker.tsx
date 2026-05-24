import type { CandidateForm } from '../../shared/types'

interface Props {
  candidates: CandidateForm[]
  onPick: (index: number | undefined) => void
  onCancel: () => void
}

export function CandidatePicker({ candidates, onPick, onCancel }: Props) {
  return (
    <div className="flex flex-col gap-2 p-3 border border-slate-200 rounded bg-white">
      <div className="text-sm font-medium">
        Multiple forms found — pick one
      </div>
      <ul className="flex flex-col gap-1">
        {candidates.map(c => (
          <li key={c.index}>
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 border border-slate-200 rounded hover:bg-slate-50 text-sm"
              onClick={() => onPick(c.index === -1 ? undefined : c.index)}
            >
              {c.label}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="self-start text-xs text-slate-500"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  )
}
