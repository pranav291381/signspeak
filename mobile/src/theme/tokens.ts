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
  /** Main actions and selected states: ink in the light theme, saffron in the dark theme. */
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  /** The brand saffron, as a fill (hero cards, the selected tab). Text on it uses `onAccent`. */
  accent: string;
  onAccent: string;
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
  /** The floating tab bar, and its unselected icons and labels. */
  tabBar: string;
  onTabBar: string;
}

/** SignSpeak's identity, from the logo: saffron, deep ink and warm paper. */
export const brand = {
  saffron: '#F4B63F',
  ink: '#1F232C',
} as const;

export const lightColors: ColorPalette = {
  background: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceAlt: '#F3EEE6',
  border: '#ECE5DA',
  outline: '#8A8275',
  text: '#1A1D24',
  textSecondary: '#5E5950',
  primary: brand.ink,
  onPrimary: '#FFFFFF',
  primaryContainer: '#FCEFD3',
  onPrimaryContainer: '#5A3E00',
  accent: brand.saffron,
  onAccent: brand.ink,
  danger: '#C4261D',
  onDanger: '#FFFFFF',
  info: '#3B4252',
  infoBackground: '#F1ECE3',
  success: '#177A43',
  successBackground: '#E7F4EC',
  warning: '#A3480B',
  warningBackground: '#FCEEE3',
  dangerBackground: '#FCEDEA',
  focus: brand.ink,
  scrim: 'rgba(20, 22, 28, 0.62)',
  onScrim: '#FFFFFF',
  tabBar: brand.ink,
  onTabBar: '#A9AEBA',
};

export const darkColors: ColorPalette = {
  background: '#0F1115',
  surface: '#181B21',
  surfaceAlt: '#22262E',
  border: '#2C313B',
  outline: '#747B89',
  text: '#F4F1EA',
  textSecondary: '#AEA99F',
  primary: brand.saffron,
  onPrimary: '#1A1C21',
  primaryContainer: '#3A2F16',
  onPrimaryContainer: '#FFE0A3',
  accent: brand.saffron,
  onAccent: '#1A1C21',
  danger: '#FF8A7E',
  onDanger: '#1A1C21',
  info: '#BAC3D4',
  infoBackground: '#1F242E',
  success: '#62D394',
  successBackground: '#12291C',
  warning: '#FFA766',
  warningBackground: '#36210F',
  dangerBackground: '#3A1917',
  focus: brand.saffron,
  scrim: 'rgba(8, 9, 12, 0.66)',
  onScrim: '#FFFFFF',
  tabBar: '#1F232B',
  onTabBar: '#A3A8B3',
};

/**
 * Fills of the small icon tiles in lists (Settings). Decorative: every row also
 * has a text label. Icons on them are white.
 */
export const tileColors = {
  saffron: '#E09A12',
  ink: '#3B4252',
  teal: '#138A7A',
  violet: '#6D5BD0',
  rose: '#D2455B',
  blue: '#2F6FD6',
  green: '#2E8B57',
  slate: '#6B7280',
} as const;

export type TileColor = keyof typeof tileColors;

/** Colours of the hand-skeleton diagram, one per finger (thumb → little finger). */
export const skeletonColors = {
  light: { fingers: ['#F97316', '#8B5CF6', '#3B82F6', '#10B981', '#EC4899'], palm: '#6B6457', body: '#A59D8F' },
  dark: { fingers: ['#FDBA74', '#C4B5FD', '#93C5FD', '#6EE7B7', '#F9A8D4'], palm: '#A09A8E', body: '#4E5360' },
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
  sm: 10,
  md: 14,
  lg: 22,
  xl: 28,
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
  display: { fontSize: 34, lineHeight: 42, weight: '700', letterSpacing: -0.8 },
  title: { fontSize: 24, lineHeight: 31, weight: '700', letterSpacing: -0.5 },
  heading: { fontSize: 18, lineHeight: 25, weight: '600', letterSpacing: -0.25 },
  body: { fontSize: 16, lineHeight: 24, weight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, weight: '600', letterSpacing: -0.1 },
  label: { fontSize: 15, lineHeight: 20, weight: '600', letterSpacing: -0.1 },
  caption: { fontSize: 14, lineHeight: 20, weight: '400' },
  overline: { fontSize: 12, lineHeight: 16, weight: '700', letterSpacing: 1, textTransform: 'uppercase' },
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

// Soft, warm shadows: the paper background is tinted, so cards lift off it without hard edges.
const lightElevation: Elevation = {
  card: { boxShadow: '0px 1px 2px rgba(40, 30, 10, 0.05), 0px 8px 24px rgba(40, 30, 10, 0.06)' },
  raised: { boxShadow: '0px 12px 32px rgba(20, 22, 28, 0.22)' },
};

// Shadows are barely visible on dark backgrounds; borders separate surfaces instead.
const darkElevation: Elevation = { card: {}, raised: { boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.55)' } };

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
