import { decodeSpecFrames, encodeFrames, toXY, XY_FRAME_DIM } from '@/personal/codec';
import { RIGHT_HAND_PRESENT_INDEX, RIGHT_HAND_START } from '@/recognition/featureSpec';
import { parseSignPack } from '@/signpack/parse';
import { MOTIONS, perform } from '@/test-utils/landmarks';

import { buildMotionPack, chooseRecording, type Row } from '../../../scripts/lib/motion-pack';

function recording(motion: keyof typeof MOTIONS, seed: number, loseHand: number[] = []) {
  const frames = perform(MOTIONS[motion]!, { seed, durationMs: 1200, restBeforeMs: 400, restAfterMs: 400 }).map((f, i) => {
    const values = Float32Array.from(f.values!);
    if (loseHand.includes(i)) {
      values.fill(0, RIGHT_HAND_START, RIGHT_HAND_START + 63);
      values[RIGHT_HAND_PRESENT_INDEX] = 0;
    }
    return toXY(values);
  });
  return { frames: frames.length, dim: XY_FRAME_DIM, data: encodeFrames(frames, XY_FRAME_DIM) };
}

const row = (text: string, group: string, rec: Row['recording'], category = 'Greetings'): Row => ({ text, group, category, recording: rec });

describe('chooseRecording', () => {
  it('prefers the recording that lost the hands least, then the most typical one', () => {
    const lossy = row('Hello', 'a', recording('wave', 1, [9, 10, 11, 12, 13, 14]));
    const odd = row('Hello', 'b', recording('scratch', 2));
    const typical = row('Hello', 'c', recording('wave', 3));
    const another = row('Hello', 'd', recording('wave', 4));
    const pick = chooseRecording([lossy, odd, typical, another])!;
    expect([typical.group, another.group]).toContain(pick.row.group);
    expect(pick.candidates).toBe(4);
    expect(pick.coverage).toBeGreaterThan(0.9);
  });

  it('has nothing to choose when nobody signs', () => {
    const still = perform([{}], { durationMs: 600 }).map((f) => toXY(f.values!));
    expect(chooseRecording([row('Rest', 'a', { frames: still.length, dim: XY_FRAME_DIM, data: encodeFrames(still, XY_FRAME_DIM) })])).toBeNull();
  });
});

describe('buildMotionPack', () => {
  it('writes a sign pack the app reads, one trimmed recording per sign', () => {
    const rows = [
      row('Hello', 'a', recording('wave', 1)),
      row('Hello', 'b', recording('wave', 2)),
      row('Big / large', 'a', recording('point_arc', 3), 'Adjectives'),
    ];
    const { pack, chosen, skipped } = buildMotionPack(rows, {
      id: 'demo-motion',
      name: 'Demo signs',
      source: { name: 'Demo', url: 'https://example.org/', permission: 'Test data.' },
      language: 'en',
      createdAt: '2026-09-28T00:00:00.000Z',
      margin: 2,
    });
    expect(skipped).toEqual([]);
    const parsed = parseSignPack(JSON.parse(JSON.stringify(pack)));
    expect(parsed.skipped).toBe(0);
    expect(parsed.pack.signs.map((s) => [s.id, s.text, s.category])).toEqual([
      ['demo-motion:big-large', 'Big / large', 'Adjectives'],
      ['demo-motion:hello', 'Hello', 'Greetings'],
    ]);
    expect(chosen.map((c) => c.text)).toEqual(['Big / large', 'Hello']);
    // Trimmed to the signing plus the margin: most of the 400 ms of rest either side is gone.
    const sample = parsed.pack.signs[1]!.samples[0]!;
    const frames = decodeSpecFrames(sample.data, sample.frames, sample.dim);
    expect(frames.length).toBe(chosen[1]!.frames);
    expect(frames.length).toBeLessThan(18 + 2 * 6);
  });
});
