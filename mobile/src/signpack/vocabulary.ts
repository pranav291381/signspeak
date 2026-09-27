import type { LanguageCode } from '@/i18n/languages';
import type { ModelPack } from '@/model/modelPack';
import type { ReferenceSign } from '@/personal/matcher';

import { packReferences } from './parse';
import type { SignPack, SignPackSource } from './types';

export interface VocabularySign {
  text: string;
  language: LanguageCode;
  letter: boolean;
  packId: string;
  sourceUrl?: string;
}

export interface VocabularyPack {
  id: string;
  name: string;
  source: SignPackSource;
  signCount: number;
}

/** Everything Sign → Text can recognize, from the installed sign packs. */
export interface Vocabulary {
  packs: VocabularyPack[];
  /** Number of signs. */
  size: number;
  /** Languages the signs' meanings are written in. */
  languages: LanguageCode[];
  references: ReferenceSign[];
  /** A trained model, used for recognition instead of the sign packs' recordings. */
  model: ModelPack | null;
  describe(label: string): VocabularySign | undefined;
}

export function buildVocabulary(packs: readonly SignPack[], models: readonly ModelPack[] = []): Vocabulary {
  const signs = new Map<string, VocabularySign>();
  const references: ReferenceSign[] = [];
  const model = models[0] ?? null;
  if (model) {
    for (const label of model.labels) {
      if (label.id === model.unknownLabel || signs.has(label.id)) continue;
      signs.set(label.id, { text: label.text, language: model.language, letter: false, packId: model.id });
    }
  }
  for (const pack of packs) {
    // A sign id already taken by an earlier pack keeps that pack's sign.
    const added = new Set<string>();
    for (const sign of pack.signs) {
      if (signs.has(sign.id)) continue;
      added.add(sign.id);
      signs.set(sign.id, {
        text: sign.text,
        language: sign.language,
        letter: sign.letter === true,
        packId: pack.id,
        ...(sign.sourceUrl ? { sourceUrl: sign.sourceUrl } : {}),
      });
    }
    references.push(...packReferences(pack).filter((r) => added.has(r.id)));
  }
  return {
    packs: [
      ...(model ? [{ id: model.id, name: model.name, source: model.source, signCount: [...signs.values()].filter((s) => s.packId === model.id).length }] : []),
      ...packs.map((p) => ({ id: p.id, name: p.name, source: p.source, signCount: p.signs.length })),
    ],
    size: signs.size,
    languages: [...new Set([...signs.values()].map((s) => s.language))],
    references,
    model,
    describe: (label) => signs.get(label),
  };
}
