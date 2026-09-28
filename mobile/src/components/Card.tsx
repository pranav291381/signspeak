import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

interface Props {
  children: ReactNode;
  /** `tinted` uses the primary container colour for highlighted content, `muted` the grouped-area colour. */
  tone?: 'default' | 'tinted' | 'muted';
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Rounded surface that groups related content. */
export function Card({ children, tone = 'default', padded = true, style, testID }: Props) {
  const { colors, elevation, radii, spacing } = useTheme();
  const background = { default: colors.surface, tinted: colors.primaryContainer, muted: colors.surfaceAlt }[tone];
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        tone === 'default' ? elevation.card : null,
        {
          backgroundColor: background,
          borderColor: tone === 'default' ? colors.border : background,
          borderRadius: radii.lg,
          padding: padded ? spacing.lg + 2 : 0,
          gap: spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
});
