import { personalReferences } from './matcher';
import { ReferenceSignRecognizer } from './ReferenceSignRecognizer';
import type { PersonalSign } from './types';

/** Recognizes the signs taught on this phone (those with enough recordings). */
export class PersonalSignRecognizer extends ReferenceSignRecognizer {
  constructor(signs: readonly PersonalSign[]) {
    super(personalReferences(signs), {
      id: 'personal-dtw',
      version: '1',
      emptyMessage: 'No personal signs with enough recordings',
      labels: signs.map((s) => s.id),
    });
  }
}
