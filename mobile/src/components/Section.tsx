import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Card } from './Card';

interface Props {
  title?: string;
  /** Short explanation under the title. */
  description?: string;
  children: ReactNode;
  testID?: string;
}

/** Titled group of related content on a card. */
export function Section({ title, description, children, testID }: Props) {
  const { spacing } = useTheme();
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
      <Card>{children}</Card>
    </View>
  );
}
