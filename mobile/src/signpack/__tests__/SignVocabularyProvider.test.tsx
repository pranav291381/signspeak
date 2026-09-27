import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { testPack } from '@/test-utils/packs';

import type { LoadedPacks } from '../loader';
import { SignVocabularyProvider, useSignVocabulary } from '../SignVocabularyProvider';

function Status({ testID }: { testID: string }) {
  const state = useSignVocabulary();
  return <Text testID={testID}>{state.status === 'ready' ? `ready ${state.vocabulary.size}` : state.status}</Text>;
}

function deferred() {
  let resolve!: (value: LoadedPacks) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<LoadedPacks>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('SignVocabularyProvider', () => {
  it('loads the packs once, when a screen first asks', async () => {
    const pending = deferred();
    const load = jest.fn(() => pending.promise);
    render(
      <SignVocabularyProvider load={load}>
        <Status testID="first" />
        <Status testID="second" />
      </SignVocabularyProvider>,
    );
    expect(screen.getByTestId('first')).toHaveTextContent('loading');
    await act(async () => pending.resolve({ packs: [testPack([{ text: 'Hello', motion: 'wave' }])], failed: [] }));
    expect(screen.getByTestId('first')).toHaveTextContent('ready 1');
    expect(screen.getByTestId('second')).toHaveTextContent('ready 1');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not load anything until asked', () => {
    const load = jest.fn(() => deferred().promise);
    render(<SignVocabularyProvider load={load}>{null}</SignVocabularyProvider>);
    expect(load).not.toHaveBeenCalled();
  });

  it('reports an empty vocabulary when no pack is installed or loading fails', async () => {
    const pending = deferred();
    render(
      <SignVocabularyProvider load={() => pending.promise}>
        <Status testID="status" />
      </SignVocabularyProvider>,
    );
    await act(async () => pending.reject(new Error('disk error')));
    expect(screen.getByTestId('status')).toHaveTextContent('empty');
  });
});
