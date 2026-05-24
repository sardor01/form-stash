import { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../../shared/storage';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types';

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  if (!settings) {
    return (
      <div className="p-3 border border-slate-200 rounded bg-white">
        Loading…
      </div>
    );
  }

  async function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    const next = { ...settings!, [key]: value };
    setSettings(next);
    await saveSettings(next);
  }

  return (
    <div className="flex flex-col gap-3 p-3 border border-slate-200 rounded bg-white">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Settings</h2>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-700 text-base"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <Toggle
        label="Auto-prompt to save on submit"
        checked={settings.autoPromptOnSubmit}
        onChange={(v) => update('autoPromptOnSubmit', v)}
      />
      <Toggle
        label="Block submit when capturing (then show 'Continue submit')"
        checked={settings.preventSubmitOnCapture}
        onChange={(v) => update('preventSubmitOnCapture', v)}
      />
      <Toggle
        label="Capture password fields (stored in plaintext, never sync)"
        checked={settings.capturePasswords}
        onChange={(v) => update('capturePasswords', v)}
      />
      <Toggle
        label="Dispatch blur after filling (helps blur-based validators)"
        checked={settings.fillEventBlur}
        onChange={(v) => update('fillEventBlur', v)}
      />
      <label className="flex flex-col gap-1 text-sm">
        <span>Per-field wait timeout (ms)</span>
        <input
          type="number"
          min={100}
          className="border border-slate-300 rounded px-2 py-1 w-32"
          value={settings.perFieldTimeoutMs}
          onChange={(e) =>
            update(
              'perFieldTimeoutMs',
              Math.max(
                100,
                Number.parseInt(e.target.value, 10) ||
                  DEFAULT_SETTINGS.perFieldTimeoutMs,
              ),
            )
          }
        />
      </label>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
