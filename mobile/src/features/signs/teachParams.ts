import type { TeachParams } from '@/features/teach/targets';
import type { SignTarget } from '@/personal/types';

/** Route parameters that open the recorder for `target` (another take of the same sign). */
export function teachParams(target: SignTarget): TeachParams {
  switch (target.kind) {
    case 'vocabulary':
      return { kind: 'vocabulary', label: target.label };
    case 'library':
      return { kind: 'library', id: target.signId };
    case 'letter':
      return { kind: 'letter', letter: target.letter };
    case 'custom':
      return { kind: 'custom', text: target.text };
  }
}
