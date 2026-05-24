import { useEffect, useState } from 'react';
import {
  clearSyncSession,
  getSyncConfig,
  getSyncSession,
  onSyncConfigChanged,
  patchSyncConfig,
} from '../../sync/config';
import {
  runSync,
  setPassphrase,
  signInInteractive,
  signOut,
} from '../../sync/engine';
import type { SyncConfig, SyncSession } from '../../sync/types';

interface Props {
  onClose: () => void;
}

export function SyncPanel({ onClose }: Props) {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [session, setSession] = useState<SyncSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [passphrase, setPassphraseValue] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [c, s] = await Promise.all([getSyncConfig(), getSyncSession()]);
      if (cancelled) return;
      setConfig(c);
      setSession(s);
    }
    load();
    const off = onSyncConfigChanged(() => load());
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  if (!config) {
    return (
      <div className="p-3 border border-slate-200 rounded bg-white">
        Loading sync…
      </div>
    );
  }

  async function updateConfig(patch: Partial<SyncConfig>) {
    const next = await patchSyncConfig(patch);
    setConfig(next);
  }

  async function withBusy<T>(name: string, fn: () => Promise<T>) {
    setBusy(name);
    setError(null);
    setInfo(null);
    try {
      const r = await fn();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setBusy(null);
    }
  }

  async function handleSignIn() {
    await withBusy('sign-in', async () => {
      const s = await signInInteractive();
      setSession(s);
      setInfo('Signed in.');
    }).catch(() => undefined);
  }

  async function handleSetPassphrase(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase) {
      setError('Enter a passphrase first');
      return;
    }
    await withBusy('passphrase', async () => {
      await setPassphrase(passphrase);
      setPassphraseValue('');
      const s = await getSyncSession();
      setSession(s);
      setInfo(
        'Passphrase set. Use the same passphrase on every profile to decrypt.',
      );
    }).catch(() => undefined);
  }

  async function handleSyncNow() {
    await withBusy('sync', async () => {
      const result = await runSync();
      if (result.ok) {
        const pulledCount = sumCounts(result.pulled);
        const pushedCount = sumCounts(result.pushed);
        setInfo(
          `Sync done — pulled ${pulledCount} record${pulledCount === 1 ? '' : 's'}, pushed ${pushedCount}.`,
        );
      } else {
        setError(result.reason ?? 'sync failed');
      }
    }).catch(() => undefined);
  }

  async function handleSignOut() {
    await withBusy('sign-out', async () => {
      await signOut();
      await clearSyncSession();
      setSession(null);
      setInfo('Signed out.');
    }).catch(() => undefined);
  }

  const passphraseSet = !!session?.keyB64;
  const signedIn = !!session?.idToken;

  return (
    <div className="flex flex-col gap-3 p-3 border border-slate-200 rounded bg-white">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Cloud sync</h2>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-700 text-base"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <StatusRow config={config} signedIn={signedIn} passphraseSet={passphraseSet} />

      <fieldset className="flex flex-col gap-2 border border-slate-200 rounded p-2">
        <legend className="text-xs text-slate-500 px-1">Worker</legend>
        <label className="flex flex-col gap-1 text-sm">
          <span>Worker URL</span>
          <input
            type="url"
            placeholder="https://form-stash-sync.your-account.workers.dev"
            className="border border-slate-300 rounded px-2 py-1"
            value={config.workerUrl}
            onChange={(e) => updateConfig({ workerUrl: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Google OAuth Client ID</span>
          <input
            type="text"
            placeholder="…apps.googleusercontent.com"
            className="border border-slate-300 rounded px-2 py-1 font-mono text-xs"
            value={config.googleClientId}
            onChange={(e) => updateConfig({ googleClientId: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => updateConfig({ enabled: e.target.checked })}
            disabled={!config.workerUrl || !config.googleClientId}
          />
          <span>Enable sync</span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2 border border-slate-200 rounded p-2">
        <legend className="text-xs text-slate-500 px-1">Account</legend>
        {signedIn ? (
          <div className="text-sm flex items-center justify-between">
            <span>
              Signed in as{' '}
              <strong>{config.googleEmail ?? config.googleSub}</strong>
            </span>
            <button
              type="button"
              className="text-xs text-slate-500"
              onClick={handleSignOut}
              disabled={busy === 'sign-out'}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="px-2 py-1 bg-indigo-600 text-white text-xs rounded self-start disabled:opacity-50"
            onClick={handleSignIn}
            disabled={!config.googleClientId || busy === 'sign-in'}
          >
            {busy === 'sign-in' ? 'Signing in…' : 'Sign in with Google'}
          </button>
        )}
      </fieldset>

      {signedIn && (
        <fieldset className="flex flex-col gap-2 border border-slate-200 rounded p-2">
          <legend className="text-xs text-slate-500 px-1">
            Encryption passphrase
          </legend>
          <div className="text-xs text-slate-500">
            {passphraseSet
              ? 'Passphrase is set for this browser session. Use the same passphrase on every profile so they can decrypt each other.'
              : 'Pick or enter your sync passphrase. The same one must be used on every profile that should share data.'}
          </div>
          <form onSubmit={handleSetPassphrase} className="flex gap-2">
            <input
              type={showPassphrase ? 'text' : 'password'}
              className="border border-slate-300 rounded px-2 py-1 flex-1 text-sm"
              placeholder="Sync passphrase"
              value={passphrase}
              onChange={(e) => setPassphraseValue(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="text-[10px] text-slate-500 self-center"
              onClick={() => setShowPassphrase((v) => !v)}
            >
              {showPassphrase ? 'Hide' : 'Show'}
            </button>
            <button
              type="submit"
              className="px-2 py-1 bg-indigo-600 text-white text-xs rounded disabled:opacity-50"
              disabled={busy === 'passphrase' || !passphrase}
            >
              {passphraseSet ? 'Update' : 'Set'}
            </button>
          </form>
        </fieldset>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="px-2 py-1 bg-indigo-600 text-white text-xs rounded disabled:opacity-50"
          onClick={handleSyncNow}
          disabled={!config.enabled || !signedIn || !passphraseSet || busy === 'sync'}
        >
          {busy === 'sync' ? 'Syncing…' : 'Sync now'}
        </button>
        {config.lastPullAt && (
          <span className="text-xs text-slate-500">
            Last sync: {formatRelative(config.lastPullAt)}
          </span>
        )}
      </div>

      {info && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
          {info}
        </div>
      )}
      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  );
}

function StatusRow({
  config,
  signedIn,
  passphraseSet,
}: {
  config: SyncConfig;
  signedIn: boolean;
  passphraseSet: boolean;
}) {
  const status = describeStatus(config, signedIn, passphraseSet);
  return (
    <div
      className={`text-xs rounded px-2 py-1 ${status.tone === 'good' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : status.tone === 'warn' ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-rose-50 border border-rose-200 text-rose-800'}`}
    >
      {status.text}
    </div>
  );
}

function describeStatus(
  config: SyncConfig,
  signedIn: boolean,
  passphraseSet: boolean,
): { text: string; tone: 'good' | 'warn' | 'bad' } {
  if (!config.workerUrl || !config.googleClientId)
    return { text: 'Enter Worker URL + Google client ID to start.', tone: 'warn' };
  if (!signedIn)
    return { text: 'Sign in with Google to enable sync.', tone: 'warn' };
  if (!passphraseSet)
    return { text: 'Set your encryption passphrase.', tone: 'warn' };
  if (!config.enabled) return { text: 'Sync is disabled.', tone: 'warn' };
  switch (config.lastStatus) {
    case 'ok':
      return { text: 'Sync up to date.', tone: 'good' };
    case 'syncing':
      return { text: 'Syncing…', tone: 'good' };
    case 'error':
      return {
        text: `Last sync failed: ${config.lastError ?? 'unknown error'}`,
        tone: 'bad',
      };
    case 'needs-passphrase':
      return { text: 'Passphrase required.', tone: 'warn' };
    case 'needs-signin':
      return { text: 'Sign in again to resume sync.', tone: 'warn' };
    default:
      return { text: 'Ready to sync.', tone: 'good' };
  }
}

function sumCounts(record: Partial<Record<string, number>>): number {
  return Object.values(record).reduce((s: number, v) => s + (v ?? 0), 0);
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}
