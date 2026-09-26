import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createMemoryStore } from '@/storage/keyValueStore';
import { MOTIONS, perform } from '@/test-utils/landmarks';

import { targetText } from '../labels';
import { PersonalSignsProvider, usePersonalSigns } from '../PersonalSignsProvider';
import { loadSigns } from '../store';

const frames = perform(MOTIONS.wave!, { durationMs: 600 }).map((f) => f.values!);

function setup(store = createMemoryStore()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PersonalSignsProvider store={store}>{children}</PersonalSignsProvider>
  );
  return { store, ...renderHook(() => usePersonalSigns(), { wrapper }) };
}

describe('PersonalSignsProvider', () => {
  it('adds recordings, persists them, and counts a sign as recognizable from two', async () => {
    const { result, store } = setup();
    await waitFor(() => expect(result.current.ready).toBe(true));

    const target = { kind: 'library', signId: 'hello' } as const;
    await act(() => result.current.addSample(target, frames));
    expect(result.current.signs).toHaveLength(1);
    expect(result.current.recognizable).toHaveLength(0);

    await act(() => result.current.addSample(target, frames));
    expect(result.current.get('library:hello')?.samples).toHaveLength(2);
    expect(result.current.recognizable).toHaveLength(1);
    expect((await loadSigns(store))[0]!.samples).toHaveLength(2);
  });

  it('deletes one recording, a whole sign, or everything', async () => {
    const { result, store } = setup();
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(() => result.current.addSample({ kind: 'letter', letter: 'a' }, frames));
    await act(() => result.current.addSample({ kind: 'letter', letter: 'a' }, frames));
    await act(() => result.current.addSample({ kind: 'letter', letter: 'b' }, frames));

    await act(() => result.current.removeSample('letter:a', 0));
    expect(result.current.get('letter:a')?.samples).toHaveLength(1);
    // Removing the last recording removes the sign.
    await act(() => result.current.removeSample('letter:a', 0));
    expect(result.current.get('letter:a')).toBeUndefined();

    await act(() => result.current.removeAll());
    expect(result.current.signs).toEqual([]);
    expect(store.data.size).toBe(0);
  });

  it('keeps working when saved data cannot be read', async () => {
    const store = { ...createMemoryStore(), getItem: () => Promise.reject(new Error('disk')) };
    const { result } = setup(store);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.signs).toEqual([]);
  });
});

describe('targetText', () => {
  it('uses the library meaning in the output language, the letter, or the typed text', () => {
    expect(targetText({ kind: 'library', signId: 'hello' }, 'hi').text).toBe('नमस्ते');
    expect(targetText({ kind: 'letter', letter: 'k' }, 'en').text).toBe('K');
    expect(targetText({ kind: 'custom', text: 'Chai', language: 'en' }, 'hi')).toEqual({ text: 'Chai', language: 'en' });
  });
});
