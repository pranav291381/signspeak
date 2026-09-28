import { parseSignPack } from '@/signpack/parse';
import { testMotionPack } from '@/test-utils/motion';

import { buildMotionLibrary } from '../library';
import { loadMotionPacks } from '../MotionLibraryProvider';

describe('buildMotionLibrary', () => {
  const pack = testMotionPack([
    { text: 'You (plural)', category: 'Pronouns' },
    { text: 'You', category: 'Pronouns', motion: 'knock' },
    { text: 'Big / large', category: 'Adjectives', motion: 'point_arc' },
  ]);
  const library = buildMotionLibrary([pack]);

  it('finds signs by name and alternative, the exact name first', () => {
    expect(library.find('you').map((s) => s.text)).toEqual(['You', 'You (plural)']);
    expect(library.find('large').map((s) => s.text)).toEqual(['Big / large']);
    expect(library.find('small')).toEqual([]);
    expect(library.categories).toEqual(['Pronouns', 'Adjectives']);
    expect(library.packs).toEqual([expect.objectContaining({ id: 'test-motion', signCount: 3 })]);
  });

  it('decodes a recording once, with where the sign is in it', () => {
    const id = library.find('you')[0]!.id;
    const clip = library.clip(id)!;
    expect(clip.skeletons.length).toBeGreaterThan(10);
    expect(clip.span).toEqual(expect.objectContaining({ start: expect.any(Number), coreEnd: expect.any(Number) }));
    expect(library.clip(id)).toBe(clip);
    expect(library.clip('test-motion:nothing')).toBeNull();
  });

  it('keeps the first pack’s sign when two packs share an id', () => {
    const other = testMotionPack([{ text: 'You', category: 'Other' }]);
    const both = buildMotionLibrary([pack, other]);
    expect(both.find('you').map((s) => s.category)).toEqual(['Pronouns', 'Pronouns']);
  });
});

describe('loadMotionPacks', () => {
  it('leaves out a pack that cannot be read', async () => {
    const good = testMotionPack([{ text: 'Hello' }]);
    const packs = await loadMotionPacks(
      [
        { id: 'broken', asset: 1 },
        { id: 'good', asset: 2 },
      ],
      async (asset) => (asset === 2 ? JSON.stringify(good) : '{"format":"something else"}'),
    );
    expect(packs.map((p) => p.id)).toEqual(['test-motion']);
  });
});

// Jest runs on Node; the app's TypeScript setup has no Node types.
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('fs') as { readFileSync(path: string, encoding: 'utf8'): string };

describe('the shipped motion pack', () => {
  const raw = JSON.parse(readFileSync(`${__dirname}/../../../assets/motions/include-motion.signpack`, 'utf8'));
  const { pack, skipped } = parseSignPack(raw);
  const library = buildMotionLibrary([pack]);

  it('has every INCLUDE sign, with its source and licence', () => {
    expect(skipped).toBe(0);
    expect(pack.signs).toHaveLength(262);
    expect(pack.source.url).toBe('https://zenodo.org/records/4010759');
    expect(pack.source.permission).toMatch(/CC BY 4\.0/);
    expect(library.categories).toHaveLength(15);
    expect(pack.signs.every((s) => s.category)).toBe(true);
  });

  it('plays every sign: a readable recording with the sign found in it', () => {
    for (const sign of library.signs) {
      const clip = library.clip(sign.id);
      expect({ sign: sign.text, frames: clip?.skeletons.length ?? 0 }).toEqual({ sign: sign.text, frames: expect.any(Number) });
      expect(clip!.skeletons.length).toBeGreaterThanOrEqual(8);
      expect(clip!.span).not.toBeNull();
      // Hands are shown during the sign.
      const core = clip!.skeletons.slice(clip!.span!.coreStart, clip!.span!.coreEnd + 1);
      expect({ sign: sign.text, hands: core.some((f) => f.left || f.right) }).toEqual({ sign: sign.text, hands: true });
    }
  });

  it('finds common phrases and alternatives', () => {
    for (const phrase of ['good morning', 'how are you', 'thank you', 'teacher', 'big', 'large', 'shop', 'road', 't shirt', 'race']) {
      expect({ phrase, found: library.find(phrase).length > 0 }).toEqual({ phrase, found: true });
    }
  });
});
