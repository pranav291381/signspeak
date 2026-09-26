import { Text, type TextProps } from 'react-native';

import { useTheme, type ColorPalette, type TextVariant } from '@/theme';

type TextColor = Extract<
  keyof ColorPalette,
  'text' | 'textSecondary' | 'primary' | 'danger' | 'success' | 'warning' | 'info' | 'onPrimary' | 'onDanger'
>;

interface Props extends TextProps {
  variant?: TextVariant;
  color?: TextColor;
}

const HEADER_VARIANTS: TextVariant[] = ['display', 'title', 'heading'];

/** Themed text. Headings get the `header` role so screen readers can jump between them. */
export function AppText({ variant = 'body', color = 'text', style, accessibilityRole, ...rest }: Props) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole={accessibilityRole ?? (HEADER_VARIANTS.includes(variant) ? 'header' : undefined)}
      style={[theme.typography[variant], { color: theme.colors[color] }, style]}
      {...rest}
    />
  );
}
