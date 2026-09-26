import { isLanguageCode, type LanguageCode } from '@/i18n/languages';
import { readJson, type KeyValueStore } from '@/storage/keyValueStore';

export const HISTORY_STORAGE_KEY = 'islconnect.history.v1';
export const MAX_HISTORY_ENTRIES = 50;

export type HistoryKind = 'recognition' | 'lookup';

/** Stored on this device only. Contains text, never images or video. */
export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  /** Recognised meaning, or the phrase the user looked up. */
  text: string;
  language: LanguageCode;
  signIds: string[];
  createdAt: number;
}

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    (v.kind === 'recognition' || v.kind === 'lookup') &&
    typeof v.text === 'string' &&
    isLanguageCode(v.language) &&
    Array.isArray(v.signIds) &&
    v.signIds.every((s) => typeof s === 'string') &&
    typeof v.createdAt === 'number'
  );
}

/** Newest first. Invalid stored entries are dropped. */
export async function loadHistory(store: KeyValueStore): Promise<HistoryEntry[]> {
  const raw = await readJson(store, HISTORY_STORAGE_KEY);
  return Array.isArray(raw) ? raw.filter(isEntry).slice(0, MAX_HISTORY_ENTRIES) : [];
}

export function prependEntry(entries: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...entries].slice(0, MAX_HISTORY_ENTRIES);
}

export async function saveHistory(store: KeyValueStore, entries: HistoryEntry[]): Promise<void> {
  await store.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
}

export async function deleteHistory(store: KeyValueStore): Promise<void> {
  await store.removeItem(HISTORY_STORAGE_KEY);
}

let counter = 0;
export function newEntryId(now: number): string {
  counter = (counter + 1) % 1_000_000;
  return `${now.toString(36)}-${counter.toString(36)}`;
}
