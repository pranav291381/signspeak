import { prepareSample } from '@/personal/sample';
import { saveSign, withSample } from '@/personal/store';
import type { PersonalSign, SignTarget } from '@/personal/types';
import type { KeyValueStore } from '@/storage/keyValueStore';

import { MOTIONS, perform } from './landmarks';

/** A personal sign with `takes` synthetic recordings of `motion`. */
export function taughtSign(target: SignTarget, motion: keyof typeof MOTIONS = 'wave', takes = 2): PersonalSign {
  let sign: PersonalSign | undefined;
  for (let i = 0; i < takes; i++) {
    const prepared = prepareSample(perform(MOTIONS[motion]!, { seed: 20 + i, durationMs: 1000 + i * 100 }));
    if (!prepared.ok) throw new Error(prepared.problem);
    sign = withSample(sign, target, prepared.frames);
  }
  return sign!;
}

/** Saves signs into a store the way the app does. */
export async function seedSigns(store: KeyValueStore, signs: PersonalSign[]): Promise<void> {
  const ids: string[] = [];
  for (const sign of signs) {
    await saveSign(store, sign, ids);
    ids.push(sign.id);
  }
}
