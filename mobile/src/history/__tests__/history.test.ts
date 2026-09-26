import { createMemoryStore } from '@/storage/keyValueStore';

import {
  deleteHistory,
  HISTORY_STORAGE_KEY,
  loadHistory,
  MAX_HISTORY_ENTRIES,
  prependEntry,
  saveHistory,
  type HistoryEntry,
} from '../history';

const entry = (n: number): HistoryEntry => ({
  id: `e${n}`,
  kind: 'recognition',
  text: `text ${n}`,
  language: 'en',
  signIds: ['hello'],
  createdAt: n,
});

describe('history storage', () => {
  it('keeps newest first and caps the number of entries', () => {
    let entries: HistoryEntry[] = [];
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) entries = prependEntry(entries, entry(i));
    expect(entries).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(entries[0]?.id).toBe(`e${MAX_HISTORY_ENTRIES + 4}`);
  });

  it('round-trips and deletes', async () => {
    const store = createMemoryStore();
    await saveHistory(store, [entry(1)]);
    await expect(loadHistory(store)).resolves.toEqual([entry(1)]);
    await deleteHistory(store);
    expect(store.data.has(HISTORY_STORAGE_KEY)).toBe(false);
    await expect(loadHistory(store)).resolves.toEqual([]);
  });

  it('drops corrupt or unexpected stored data', async () => {
    const store = createMemoryStore({
      [HISTORY_STORAGE_KEY]: JSON.stringify([entry(1), { id: 3 }, { ...entry(2), language: 'xx' }, 'junk']),
    });
    await expect(loadHistory(store)).resolves.toEqual([entry(1)]);
    const broken = createMemoryStore({ [HISTORY_STORAGE_KEY]: '{' });
    await expect(loadHistory(broken)).resolves.toEqual([]);
  });
});
