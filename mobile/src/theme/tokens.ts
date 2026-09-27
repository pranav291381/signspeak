/**
 * Design tokens. Colours are chosen for WCAG 2.2 AA contrast; see
 * `src/theme/__tests__/contrast.test.ts`, which enforces the pairs we rely on.
 */

export interface ColorPalette {
  background: string;
  surface: string;
  /** Slightly tinted surface for grouped or inactive areas. */
  surfaceAlt: string;
  /** Hairline divider/card edge. Decorative only: never the only cue for a control. */
  border: string;
  /** Edge of interactive controls (inputs, radios); meets 3:1 against surfaces. */
  outline: string;
  text: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
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
  /** Translucent layer for controls drawn over the camera preview. */
  scrim: string;
  onScrim: string;
}

export const lightColors: ColorPalette = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EFF1F5',
  border: '#E4E7EC',
  outline: '#7A8394',
  text: '#0F172A',
  textSecondary: '#4B5565',
  primary: '#4F46E5',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EEF0FF',
  onPrimaryContainer: '#3730A3',
  danger: '#C8231B',
  onDanger: '#FFFFFF',
  info: '#4F46E5',
  infoBackground: '#EEF0FF',
  success: '#12723A',
  successBackground: '#E8F6EE',
  warning: '#A15C07',
  warningBackground: '#FEF4E2',
  dangerBackground: '#FDECEA',
  focus: '#4F46E5',
  scrim: 'rgba(15, 23, 42, 0.62)',
  onScrim: '#FFFFFF',
};

export const darkColors: ColorPalette = {
  background: '#0B0F17',
  surface: '#141B26',
  surfaceAlt: '#1C2533',
  border: '#243044',
  outline: '#6B778C',
  text: '#E8ECF3',
  textSecondary: '#A3AEC0',
  primary: '#8E95FF',
  onPrimary: '#0B0F17',
  primaryContainer: '#252C55',
  onPrimaryContainer: '#D9DBFF',
  danger: '#FF8A80',
  onDanger: '#0B0F17',
  info: '#8E95FF',
  infoBackground: '#1D2447',
  success: '#5FD08F',
  successBackground: '#11291C',
  warning: '#F2B84B',
  warningBackground: '#2D2210',
  dangerBackground: '#34161A',
  focus: '#8E95FF',
  scrim: 'rgba(5, 8, 14, 0.66)',
  onScrim: '#FFFFFF',
};

/** Colours of the hand-skeleton diagram, one per finger (thumb → little finger). */
export const skeletonColors = {
  light: { fingers: ['#F97316', '#8B5CF6', '#3B82F6', '#10B981', '#EC4899'], palm: '#64748B', body: '#94A3B8' },
  dark: { fingers: ['#FDBA74', '#C4B5FD', '#93C5FD', '#6EE7B7', '#F9A8D4'], palm: '#94A3B8', body: '#475569' },
} as const;

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
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** Minimum touch target (dp), per WCAG 2.5.8 / Android guidance. */
export const MIN_TOUCH_TARGET = 48;

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'overline';

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontFamily?: string;
  fontWeight?: '400' | '500' | '600' | '700';
  letterSpacing?: number;
  textTransform?: 'uppercase';
}

/** Inter weights bundled with the app (see src/app/_layout.tsx). */
export const FONT_FAMILIES = {
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
} as const;

type Weight = keyof typeof FONT_FAMILIES;

const scale: Record<TextVariant, Omit<TypeStyle, 'fontFamily' | 'fontWeight'> & { weight: Weight }> = {
  display: { fontSize: 32, lineHeight: 40, weight: '700', letterSpacing: -0.6 },
  title: { fontSize: 24, lineHeight: 32, weight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 18, lineHeight: 26, weight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, weight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, weight: '600' },
  label: { fontSize: 15, lineHeight: 20, weight: '600' },
  caption: { fontSize: 14, lineHeight: 20, weight: '400' },
  overline: { fontSize: 12, lineHeight: 16, weight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
};

/**
 * With Inter loaded each weight is its own family (Android cannot pick a weight
 * of a custom family). If the font failed to load, fall back to the system font.
 */
export function makeTypography(customFont: boolean): Record<TextVariant, TypeStyle> {
  const out = {} as Record<TextVariant, TypeStyle>;
  for (const [variant, { weight, ...rest }] of Object.entries(scale) as [TextVariant, (typeof scale)[TextVariant]][]) {
    out[variant] = customFont ? { ...rest, fontFamily: FONT_FAMILIES[weight] } : { ...rest, fontWeight: weight };
  }
  return out;
}

export const typography = makeTypography(true);

export interface Elevation {
  /** Cards and raised surfaces. */
  card: { boxShadow?: string };
  /** Floating elements (tab bar, overlays). */
  raised: { boxShadow?: string };
}

const lightElevation: Elevation = {
  card: { boxShadow: '0px 1px 2px rgba(15, 23, 42, 0.04), 0px 4px 14px rgba(15, 23, 42, 0.05)' },
  raised: { boxShadow: '0px 8px 24px rgba(15, 23, 42, 0.12)' },
};

// Shadows are barely visible on dark backgrounds; borders separate surfaces instead.
const darkElevation: Elevation = { card: {}, raised: { boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.45)' } };

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  colors: ColorPalette;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: Record<TextVariant, TypeStyle>;
  elevation: Elevation;
}

export function makeTheme(scheme: ColorScheme, customFont = true): Theme {
  return {
    scheme,
    colors: scheme === 'dark' ? darkColors : lightColors,
    spacing,
    radii,
    typography: customFont ? typography : makeTypography(false),
    elevation: scheme === 'dark' ? darkElevation : lightElevation,
  };
}

export const lightTheme = makeTheme('light');
export const darkTheme = makeTheme('dark');
