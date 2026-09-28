import { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Card } from './Card';

interface Props {
  title?: string;
  /** Short explanation under the title. */
  description?: string;
  children: ReactNode;
  /** `list`: rows separated by hairlines, as in Settings. */
  variant?: 'card' | 'list';
  testID?: string;
}

/** Titled group of related content on a card. */
export function Section({ title, description, children, variant = 'card', testID }: Props) {
  const { colors, spacing } = useTheme();
  const list = variant === 'list';
  const items = Children.toArray(children);
  return (
    <View style={{ gap: spacing.sm }} testID={testID}>
      {title ? (
        <View style={{ gap: 2, paddingHorizontal: spacing.xs }}>
          <AppText variant="overline" color="textSecondary" accessibilityRole="header">
            {title}
          </AppText>
          {description ? (
            <AppText variant="caption" color="textSecondary">
              {description}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {list ? (
        <Card style={{ gap: 0, paddingVertical: spacing.xs }}>
          {items.map((child, i) => (
            <View key={i}>
              {i > 0 ? <View style={[styles.hairline, { backgroundColor: colors.border }]} /> : null}
              {child}
            </View>
          ))}
        </Card>
      ) : (
        <Card>{children}</Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hairline: { height: StyleSheet.hairlineWidth * 2, marginLeft: 48 },
});
