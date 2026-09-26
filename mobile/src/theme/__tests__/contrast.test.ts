import { contrastRatio } from '../contrast';
import { darkColors, lightColors, type ColorPalette } from '../tokens';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

// [foreground, background, minimum ratio] pairs actually used by components.
const pairs: [keyof ColorPalette, keyof ColorPalette, number][] = [
  ['text', 'background', AA_TEXT],
  ['text', 'surface', AA_TEXT],
  ['text', 'surfaceMuted', AA_TEXT],
  ['textSecondary', 'background', AA_TEXT],
  ['textSecondary', 'surface', AA_TEXT],
  ['primary', 'background', AA_TEXT],
  ['primary', 'surface', AA_TEXT],
  ['onPrimary', 'primary', AA_TEXT],
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
  ['border', 'surface', AA_NON_TEXT],
  ['border', 'background', AA_NON_TEXT],
  ['focus', 'surface', AA_NON_TEXT],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s palette', (_name, colors) => {
  it.each(pairs)('%s on %s meets %d:1', (fg, bg, min) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
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
