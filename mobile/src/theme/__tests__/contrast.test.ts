import { contrastRatio } from '../contrast';
import { darkColors, lightColors, makeTypography, type ColorPalette } from '../tokens';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

// [foreground, background, minimum ratio] pairs actually used by components.
const pairs: [keyof ColorPalette, keyof ColorPalette, number][] = [
  ['text', 'background', AA_TEXT],
  ['text', 'surface', AA_TEXT],
  ['text', 'surfaceAlt', AA_TEXT],
  ['textSecondary', 'background', AA_TEXT],
  ['textSecondary', 'surface', AA_TEXT],
  ['textSecondary', 'surfaceAlt', AA_TEXT],
  ['primary', 'background', AA_TEXT],
  ['primary', 'surface', AA_TEXT],
  ['onPrimary', 'primary', AA_TEXT],
  ['onPrimaryContainer', 'primaryContainer', AA_TEXT],
  ['primary', 'primaryContainer', AA_TEXT],
  ['text', 'primaryContainer', AA_TEXT],
  ['onDanger', 'danger', AA_TEXT],
  ['danger', 'surface', AA_TEXT],
  ['text', 'infoBackground', AA_TEXT],
  ['text', 'successBackground', AA_TEXT],
  ['text', 'warningBackground', AA_TEXT],
  ['text', 'dangerBackground', AA_TEXT],
  ['info', 'infoBackground', AA_TEXT],
  ['success', 'successBackground', AA_TEXT],
  ['warning', 'warningBackground', AA_TEXT],
  ['danger', 'dangerBackground', AA_TEXT],
  ['success', 'surface', AA_TEXT],
  ['warning', 'surface', AA_TEXT],
  // Control edges (inputs, unselected radios, switch tracks). `border` is decorative only.
  ['outline', 'surface', AA_NON_TEXT],
  ['outline', 'background', AA_NON_TEXT],
  ['outline', 'surfaceAlt', AA_NON_TEXT],
  ['focus', 'surface', AA_NON_TEXT],
  ['primary', 'surfaceAlt', AA_NON_TEXT],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s palette', (_name, colors) => {
  it.each(pairs)('%s on %s meets %d:1', (fg, bg, min) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe('scrim', () => {
  // White text on the camera overlay: the scrim is at least 60% opaque, so even
  // over a white camera image the text keeps ≥ 4.5:1.
  it.each([lightColors, darkColors])('is dark and opaque enough for white text', (colors) => {
    const [r, g, b, a] = colors.scrim.match(/[\d.]+/g)!.map(Number) as [number, number, number, number];
    const over = (c: number) => Math.round(c * a + 255 * (1 - a));
    const hex = `#${[r, g, b].map((c) => over(c).toString(16).padStart(2, '0')).join('')}`;
    expect(contrastRatio(colors.onScrim, hex)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('typography', () => {
  it('uses one Inter family per weight, or system weights when the font is unavailable', () => {
    expect(makeTypography(true).title).toMatchObject({ fontFamily: 'Inter_700Bold' });
    expect(makeTypography(true).title.fontWeight).toBeUndefined();
    expect(makeTypography(false).title).toMatchObject({ fontWeight: '700' });
    expect(makeTypography(false).title.fontFamily).toBeUndefined();
  });
});

describe('contrastRatio', () => {
  it('computes the canonical black/white ratio', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('rejects malformed colours', () => {
    expect(() => contrastRatio('red', '#FFFFFF')).toThrow();
  });
});
