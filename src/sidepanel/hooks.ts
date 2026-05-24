import { useCallback, useEffect, useState } from 'react';
import {
  getAllData,
  getSettings,
  onStorageChanged,
} from '../shared/storage';
import { getActiveTab } from '../shared/messaging';
import type {
  FormDef,
  PageInfo,
  Preset,
  Project,
  Settings,
} from '../shared/types';

export interface Store {
  projects: Project[];
  forms: FormDef[];
  presets: Preset[];
  settings: Settings;
  loaded: boolean;
}

const initialStore: Store = {
  projects: [],
  forms: [],
  presets: [],
  settings: {
    autoPromptOnSubmit: true,
    preventSubmitOnCapture: false,
    capturePasswords: false,
    fillEventBlur: true,
    perFieldTimeoutMs: 3000,
  },
  loaded: false,
};

export function useStore(): Store {
  const [store, setStore] = useState<Store>(initialStore);

  const refresh = useCallback(async () => {
    const data = await getAllData();
    setStore({ ...data, loaded: true });
  }, []);

  useEffect(() => {
    void refresh();
    return onStorageChanged(() => {
      void refresh();
    });
  }, [refresh]);

  return store;
}

export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (!cancelled) setSettings(s);
    });
    const off = onStorageChanged(() => {
      getSettings().then((s) => {
        if (!cancelled) setSettings(s);
      });
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  return settings;
}

export function useActiveTabInfo(): PageInfo | null {
  const [info, setInfo] = useState<PageInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const tab = await getActiveTab();
      if (!tab || tab.id == null) {
        if (!cancelled) setInfo(null);
        return;
      }
      try {
        const url = tab.url ?? '';
        const u = url ? new URL(url) : null;
        if (cancelled) return;
        setInfo({
          url,
          origin: u?.origin ?? '',
          path: u?.pathname ?? '',
          title: tab.title ?? '',
        });
      } catch {
        if (!cancelled) setInfo(null);
      }
    }
    void load();

    const onActivated = () => load();
    const onUpdated = (_id: number, change: { url?: string }) => {
      if (change.url) load();
    };
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      cancelled = true;
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return info;
}
