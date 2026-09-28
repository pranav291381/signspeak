import { frameFor, type HandPose } from '@/test-utils/landmarks';

import { signSpan } from '../segment';

const OPEN: HandPose['curl'] = [0, 0, 0, 0, 0];
const at = (y: number, x = -0.4) => frameFor({ right: { x, y, curl: OPEN } });
const rest = () => frameFor({});

describe('signSpan', () => {
  it('finds the sign between the arm rising from rest and dropping back', () => {
    const frames = [
      rest(),
      rest(),
      // rising fast
      at(1.1),
      at(0.6),
      at(0.1),
      // the sign: small movements
      at(-0.3),
      at(-0.3, -0.35),
      at(-0.32, -0.3),
      at(-0.3, -0.35),
      at(-0.3),
      // dropping fast
      at(0.2),
      at(0.7),
      at(1.15),
      rest(),
    ];
    expect(signSpan(frames)).toEqual({ start: 2, end: 12, coreStart: 5, coreEnd: 9 });
  });

  it('keeps most of a sign that moves fast throughout', () => {
    const frames = [rest(), ...Array.from({ length: 12 }, (_, k) => at(k % 2 ? -0.6 : 0.2)), rest()];
    const span = signSpan(frames)!;
    expect(span.start).toBe(1);
    expect(span.end).toBe(12);
    // The rise and drop never take more than about a third each.
    expect(span.coreStart - span.start).toBeLessThanOrEqual(4);
    expect(span.end - span.coreEnd).toBeLessThanOrEqual(4);
    expect(span.coreEnd).toBeGreaterThan(span.coreStart);
  });

  it('is null when nobody signs', () => {
    expect(signSpan([rest(), rest()])).toBeNull();
  });
});
