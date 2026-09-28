import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale } from '@/components';
import type { MotionLibrary } from '@/motion/library';
import { useTheme } from '@/theme';

interface Props {
  library: MotionLibrary;
  onPick: (name: string) => void;
  categoryLabel: (category: string) => string;
  testID?: string;
}

/** Every recorded sign, by category, to look one up without knowing its exact name. */
export function SignDictionary({ library, onPick, categoryLabel, testID }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const categories = [...library.categories].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
  const signs = open ? library.signs.filter((s) => s.category === open).sort((a, b) => a.text.localeCompare(b.text)) : [];

  const chip = (selected: boolean) => [
    styles.chip,
    { borderRadius: radii.pill, backgroundColor: selected ? colors.primary : colors.surfaceAlt },
  ];

  return (
    <View testID={testID} style={{ gap: spacing.sm }}>
      <View style={[styles.wrap, { gap: spacing.xs }]}>
        {categories.map((category) => {
          const selected = category === open;
          const count = library.signs.filter((s) => s.category === category).length;
          return (
            <PressableScale
              key={category}
              testID={`dictionary-category-${category}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: selected }}
              accessibilityLabel={t('textToIsl.categoryA11y', { name: categoryLabel(category), count })}
              onPress={() => setOpen(selected ? null : category)}
              style={chip(selected)}
            >
              <AppText variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
                {categoryLabel(category)}
              </AppText>
              <AppText variant="caption" style={{ color: selected ? colors.onPrimary : colors.textSecondary }}>
                {count}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
      {open ? (
        <View
          testID="dictionary-signs"
          style={[styles.wrap, { gap: spacing.xs, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surfaceAlt }]}
        >
          {signs.map((sign) => (
            <PressableScale
              key={sign.id}
              testID={`dictionary-sign-${sign.id}`}
              accessibilityRole="button"
              accessibilityLabel={t('textToIsl.tryExample', { text: sign.text })}
              onPress={() => onPick(sign.text)}
              style={[styles.chip, { borderRadius: radii.pill, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
            >
              <AppText variant="label">{sign.text}</AppText>
            </PressableScale>
          ))}
        </View>
      ) : (
        <AppText variant="caption" color="textSecondary">
          {t('textToIsl.dictionaryHint')}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, minHeight: 44 },
});
