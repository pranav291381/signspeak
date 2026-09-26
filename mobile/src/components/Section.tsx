import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

interface Props {
  title?: string;
  children: ReactNode;
}

/** Titled group of related content on a surface card. */
export function Section({ title, children }: Props) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {title ? <AppText variant="heading">{title}</AppText> : null}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.lg },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
});
