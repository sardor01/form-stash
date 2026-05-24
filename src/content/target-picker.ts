import type {
  CaptureResult,
  Settings,
} from '../shared/types'
import {
  captureFromRoot,
  listCandidateForms,
  resolveCaptureRoot,
} from './snapshot'

export function captureNow(
  settings: Settings,
  candidateSelector?: string,
): CaptureResult {
  if (candidateSelector) {
    const root = resolveCaptureRoot(document, candidateSelector)
    return captureFromRoot(root, settings)
  }

  const candidates = listCandidateForms(document, settings)
  if (candidates.length === 0) {
    return captureFromRoot(document, settings)
  }
  if (candidates.length === 1) {
    const root = resolveCaptureRoot(document, candidates[0].selector)
    return captureFromRoot(root, settings)
  }
  const empty = captureFromRoot(document, settings)
  return { ...empty, fields: [], candidates }
}
