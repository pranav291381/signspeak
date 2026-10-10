import { act, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { createMemoryStore } from '@/storage/keyValueStore';
import { renderWithProviders } from '@/test-utils/render';

import { useHistory } from '../HistoryProvider';

const probe: { history?: ReturnType<typeof useHistory> } = {};
function Probe() {
  const history = useHistory();
  useEffect(() => {
    probe.history = history;
  }, [history]);
  return <Text testID="entries">{history.entries.map((e) => e.text).join(',')}</Text>;
}

describe('HistoryProvider', () => {
  it('a correction replaces the wrong sign it corrects, and nothing else', async () => {
    const store = createMemoryStore();
    await store.setItem('islconnect.settings.v1', JSON.stringify({ appLanguage: 'en', outputLanguage: 'en', historyEnabled: true }));
    renderWithProviders(<Probe />, { store });
    await waitFor(() => expect(probe.history?.enabled).toBe(true));
    const recognized = (text: string) => ({ kind: 'recognition' as const, text, language: 'en' as const, signIds: [text] });
    act(() => probe.history!.add(recognized('Hello')));
    act(() => probe.history!.add(recognized('Afternoon')));
    act(() => probe.history!.add(recognized('Adult'), { replaceLatest: true }));
    expect(screen.getByTestId('entries')).toHaveTextContent('Adult,Hello');
    // A look-up is never replaced by a correction.
    act(() => probe.history!.add({ kind: 'lookup', text: 'good morning', language: 'en', signIds: [] }));
    act(() => probe.history!.add(recognized('Water'), { replaceLatest: true }));
    expect(screen.getByTestId('entries')).toHaveTextContent('Water,good morning,Adult,Hello');
  });
});
