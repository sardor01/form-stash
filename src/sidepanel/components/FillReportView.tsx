import type { FillReport, FillResult } from '../../shared/types'

interface Props {
  report: FillReport
  onClose: () => void
}

const STATUS_STYLES: Record<FillResult['status'], string> = {
  'filled': 'text-emerald-700',
  'not-found': 'text-amber-700',
  'skipped': 'text-slate-500',
  'error': 'text-rose-700',
}

export function FillReportView({ report, onClose }: Props) {
  const problems = report.results.filter(r => r.status !== 'filled')

  return (
    <div className="border border-slate-200 rounded bg-white p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Fill report</h2>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-700 text-base leading-none"
          onClick={onClose}
          aria-label="Close report"
        >
          ×
        </button>
      </div>
      <div className="text-sm">
        <span className="font-medium">
          {report.filled}
          {' '}
          /
          {report.total}
        </span>
        {' '}
        filled
        {report.notFound > 0 && (
          <>
            {' '}
            ·
            {report.notFound}
            {' '}
            not found
          </>
        )}
        {report.skipped > 0 && (
          <>
            {' '}
            ·
            {report.skipped}
            {' '}
            skipped
          </>
        )}
        {report.errored > 0 && (
          <>
            {' '}
            ·
            {report.errored}
            {' '}
            errored
          </>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="flex flex-col gap-1 max-h-72 overflow-auto border-t border-slate-200 pt-2">
          {problems.map(r => (
            <li
              key={`${describeSelector(r.selector)}|${r.type}|${r.status}`}
              className={`text-xs leading-snug ${STATUS_STYLES[r.status]}`}
            >
              <span className="font-mono">{describeSelector(r.selector)}</span>
              <span className="text-slate-500">
                {' '}
                (
                {r.type}
                )
              </span>
              <span className="ml-1 uppercase text-[10px]">{r.status}</span>
              {r.detail && (
                <div className="text-slate-500 pl-3">
                  —
                  {r.detail}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function describeSelector(sel: FillResult['selector']): string {
  return (
    sel.name
    ?? sel.id
    ?? sel.testId
    ?? sel.ariaLabel
    ?? sel.cssPath
    ?? '(no selector)'
  )
}
