import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components';
import type { LanguageCode } from '@/i18n/languages';
import { useTheme } from '@/theme';

import { DemonstrationView } from './DemonstrationView';
import { displayMeaning } from './matcher';
import type { SignEntry } from './types';

interface Props {
  sign: SignEntry;
  language: LanguageCode;
  /** Hide the demonstration area for compact lists. */
  compact?: boolean;
  onOpenLesson?: () => void;
}

/** Meaning, gloss, verification status and demonstration for one library entry. */
export function SignCard({ sign, language, compact = false, onOpenLesson }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const verified = sign.verification.status === 'verified';

  return (
    <View
      testID={`sign-card-${sign.id}`}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm }]}
    >
      <AppText variant="title">{displayMeaning(sign, language)}</AppText>
      <AppText variant="caption" color="textSecondary">
        {[
          t(`learn.categories.${sign.category}`),
          sign.gloss ? t('content.gloss', { gloss: sign.gloss }) : null,
          verified ? t('content.status.verified') : t('content.status.unverified'),
        ]
          .filter(Boolean)
          .join(' · ')}
      </AppText>
      {compact ? null : <DemonstrationView sign={sign} />}
      {onOpenLesson ? (
        <Button variant="secondary" icon="school-outline" label={t('content.openLesson')} onPress={onOpenLesson} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
});
