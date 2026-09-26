import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

interface Props {
  children: ReactNode;
  /** Scroll by default so content survives large system font sizes. */
  scroll?: boolean;
  testID?: string;
}

/** Standard screen container: themed background, safe-area padding, consistent gutters. */
export function Screen({ children, scroll = true, testID }: Props) {
  const { colors, spacing } = useTheme();
  const padding = { padding: spacing.lg, gap: spacing.lg };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.flex, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView testID={testID} contentContainerStyle={[styles.grow, padding]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View testID={testID} style={[styles.flex, padding]}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
