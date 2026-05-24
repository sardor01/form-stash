import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import type { SubmitInfo } from '../../src/content/detect-submit'
import type { Message } from '../../src/shared/messaging'
import type { Preset, Settings } from '../../src/shared/types'
import {
  attachSubmitDetection,
  onSubmitDetected,

} from '../../src/content/detect-submit'
import { applyPreset } from '../../src/content/fill-engine'
import { ensureSaveModal } from '../../src/content/save-modal/mount'
import { captureFromRoot, listCandidateForms } from '../../src/content/snapshot'
import { captureNow } from '../../src/content/target-picker'
import { ensureSchema, getSettings } from '../../src/shared/storage'
import '../../src/content/save-modal/style.css'

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    await ensureSchema()
    let settings = await getSettings()

    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) {
        getSettings().then((s) => {
          settings = s
        })
      }
    })

    attachSubmitDetection(settings)

    onSubmitDetected(info => void handleAutoCapture(ctx, info, () => settings))

    browser.runtime.onMessage.addListener(
      (rawMessage: unknown, _sender, sendResponse) => {
        const message = rawMessage as Message
        void handleMessage(ctx, message, () => settings).then((reply) => {
          sendResponse(reply)
        })
        return true
      },
    )
  },
})

async function handleAutoCapture(
  ctx: ContentScriptContext,
  info: SubmitInfo,
  getSettingsNow: () => Settings,
) {
  const settings = getSettingsNow()
  const root = info.form ?? info.root
  const snapshot = captureFromRoot(
    root as Document | Element,
    settings,
  )
  if (snapshot.fields.length === 0)
    return

  const modal = await ensureSaveModal(ctx)
  modal.open({
    snapshot,
    showContinueSubmit: settings.preventSubmitOnCapture,
    onContinueSubmit: () => {
      if (info.form)
        info.form.submit()
    },
  })
}

async function handleMessage(
  ctx: ContentScriptContext,
  message: Message,
  getSettingsNow: () => Settings,
): Promise<unknown> {
  switch (message.kind) {
    case 'PING':
      return { ok: true }

    case 'GET_PAGE_INFO':
      return {
        url: location.href,
        origin: location.origin,
        path: location.pathname,
        title: document.title,
      }

    case 'GET_CANDIDATES':
      return { candidates: listCandidateForms(document, getSettingsNow()) }

    case 'CAPTURE_NOW': {
      const settings = getSettingsNow()
      const candidates = listCandidateForms(document, settings)
      const picked
        = message.candidateIndex != null
          ? candidates.find(c => c.index === message.candidateIndex)
          ?? candidates[message.candidateIndex]
          : null
      const result = picked
        ? captureNow(settings, picked.selector)
        : captureNow(settings)

      if (result.fields.length === 0 && !result.candidates) {
        return { ...result, candidates: undefined }
      }

      if (!result.candidates) {
        const modal = await ensureSaveModal(ctx)
        modal.open({ snapshot: result })
      }
      return result
    }

    case 'APPLY_PRESET':
      return applyPresetSafe(message.preset, getSettingsNow())
  }
  return undefined
}

async function applyPresetSafe(preset: Preset, settings: Settings) {
  try {
    return await applyPreset(preset, settings)
  }
  catch (err) {
    return {
      presetId: preset.id,
      total: preset.fields.length,
      filled: 0,
      notFound: 0,
      skipped: 0,
      errored: preset.fields.length,
      results: preset.fields.map(f => ({
        selector: f.selector,
        type: f.type,
        status: 'error' as const,
        detail: err instanceof Error ? err.message : String(err),
      })),
    }
  }
}
