/**
 * Design tokens. Colours are chosen for WCAG 2.2 AA contrast; see
 * `src/theme/__tests__/contrast.test.ts`, which enforces the pairs we rely on.
 */

export interface ColorPalette {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  danger: string;
  onDanger: string;
  info: string;
  infoBackground: string;
  success: string;
  successBackground: string;
  warning: string;
  warningBackground: string;
  dangerBackground: string;
  focus: string;
}

export const lightColors: ColorPalette = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceMuted: '#ECEFF3',
  border: '#7E8796',
  text: '#16191F',
  textSecondary: '#454C58',
  primary: '#0A58A6',
  onPrimary: '#FFFFFF',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
  info: '#0A58A6',
  infoBackground: '#E6EFF9',
  success: '#1D6B3A',
  successBackground: '#E5F3EA',
  warning: '#7A4A00',
  warningBackground: '#FDF1DC',
  dangerBackground: '#FBE9E7',
  focus: '#0A58A6',
};

export const darkColors: ColorPalette = {
  background: '#0E1014',
  surface: '#1A1D23',
  surfaceMuted: '#252932',
  border: '#7C8594',
  text: '#F2F4F7',
  textSecondary: '#C0C6D0',
  primary: '#8DBBF2',
  onPrimary: '#0E1014',
  danger: '#F4A29B',
  onDanger: '#0E1014',
  info: '#8DBBF2',
  infoBackground: '#15273D',
  success: '#86D3A0',
  successBackground: '#15301F',
  warning: '#F1C26B',
  warningBackground: '#35270D',
  dangerBackground: '#3A1815',
  focus: '#8DBBF2',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Minimum touch target (dp), per WCAG 2.5.8 / Android guidance. */
export const MIN_TOUCH_TARGET = 48;

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption';

export const typography: Record<
  TextVariant,
  { fontSize: number; lineHeight: number; fontWeight: '400' | '600' | '700' }
> = {
  display: { fontSize: 30, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 25, fontWeight: '400' },
  bodyStrong: { fontSize: 17, lineHeight: 25, fontWeight: '600' },
  label: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
};

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ColorPalette;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
}

export const lightTheme: Theme = { scheme: 'light', colors: lightColors, spacing, radii, typography };
export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, spacing, radii, typography };
