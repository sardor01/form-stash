import { runSync } from '../src/sync/engine';

const SYNC_ALARM = 'form-stash-sync';
const SYNC_PERIOD_MINUTES = 5;
const DEBOUNCE_PUSH_MS = 2_000;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

export default defineBackground(() => {
  if (browser.sidePanel?.setPanelBehavior) {
    browser.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) =>
        console.error('[form-stash] sidePanel.setPanelBehavior failed', err),
      );
  }

  registerSyncAlarm();

  browser.runtime.onStartup.addListener(() => {
    registerSyncAlarm();
    triggerSync('startup');
  });
  browser.runtime.onInstalled.addListener(() => {
    registerSyncAlarm();
    triggerSync('installed');
  });

  browser.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM) triggerSync('alarm');
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.projects || changes.forms || changes.presets) {
      schedulePush();
    }
  });

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && typeof msg === 'object' && msg.kind === 'SYNC_NOW') {
      triggerSync('manual').then((result) => sendResponse(result));
      return true;
    }
    return false;
  });
});

function registerSyncAlarm() {
  if (!browser.alarms) return;
  browser.alarms.get(SYNC_ALARM).then((existing) => {
    if (!existing) {
      browser.alarms.create(SYNC_ALARM, {
        periodInMinutes: SYNC_PERIOD_MINUTES,
      });
    }
  });
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    triggerSync('push-debounce');
  }, DEBOUNCE_PUSH_MS);
}

async function triggerSync(reason: string) {
  try {
    const result = await runSync();
    if (!result.ok) {
      console.warn('[form-stash] sync skipped/failed', reason, result.reason);
    }
    return result;
  } catch (err) {
    console.error('[form-stash] sync threw', reason, err);
    return { ok: false, reason: String(err) };
  }
}
