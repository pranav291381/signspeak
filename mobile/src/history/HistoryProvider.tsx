import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useSettings } from '@/settings/SettingsProvider';
import { deviceStore, type KeyValueStore } from '@/storage/keyValueStore';

import { deleteHistory, loadHistory, newEntryId, prependEntry, saveHistory, type HistoryEntry } from './history';

interface HistoryContextValue {
  enabled: boolean;
  entries: HistoryEntry[];
  /**
   * No-op unless the user turned history on. With `replaceLatest`, the entry
   * replaces the most recent one when that is a recognition (a correction).
   */
  add(entry: Omit<HistoryEntry, 'id' | 'createdAt'>, options?: { replaceLatest?: boolean }): void;
  clear(): void;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);
const NO_ENTRIES: HistoryEntry[] = [];

export function HistoryProvider({ children, store = deviceStore }: { children: ReactNode; store?: KeyValueStore }) {
  const { settings } = useSettings();
  const enabled = settings.historyEnabled;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (enabled) {
      loadHistory(store).then((loaded) => {
        if (!cancelled) setEntries(loaded);
      });
    } else {
      // Turning history off deletes what was saved, as the setting promises.
      deleteHistory(store)
        .catch(() => undefined)
        .then(() => {
          if (!cancelled) setEntries([]);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [enabled, store]);

  const add = useCallback(
    (entry: Omit<HistoryEntry, 'id' | 'createdAt'>, options?: { replaceLatest?: boolean }) => {
      if (!enabled) return;
      const now = Date.now();
      setEntries((current) => {
        const base = options?.replaceLatest && current[0]?.kind === 'recognition' ? current.slice(1) : current;
        const next = prependEntry(base, { ...entry, id: newEntryId(now), createdAt: now });
        saveHistory(store, next).catch(() => undefined);
        return next;
      });
    },
    [enabled, store],
  );

  const clear = useCallback(() => {
    setEntries([]);
    deleteHistory(store).catch(() => undefined);
  }, [store]);

  const visible = enabled ? entries : NO_ENTRIES;
  const value = useMemo(() => ({ enabled, entries: visible, add, clear }), [enabled, visible, add, clear]);
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryContextValue {
  const value = useContext(HistoryContext);
  if (!value) throw new Error('useHistory must be used inside <HistoryProvider>');
  return value;
}
