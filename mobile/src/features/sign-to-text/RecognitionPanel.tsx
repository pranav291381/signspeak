import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Icon, Notice, type IconName } from '@/components';
import { getSign, signMeaning } from '@/content/library';
import type { LanguageCode } from '@/i18n/languages';
import type { SessionSnapshot } from '@/recognition/session';
import type { Recognition } from '@/recognition/types';
import { useTheme } from '@/theme';

interface Props {
  snapshot: SessionSnapshot;
  latest: Recognition | null;
  outputLanguage: LanguageCode;
}

type StatusKey = 'paused' | 'noSigner' | 'analyzing' | 'uncertain' | 'recognized';

const STATUS_ICONS: Record<StatusKey, IconName> = {
  paused: 'pause-circle-outline',
  noSigner: 'account-question-outline',
  analyzing: 'eye-outline',
  uncertain: 'help-circle-outline',
  recognized: 'check-circle-outline',
};

function statusKey(snapshot: SessionSnapshot): StatusKey {
  if (snapshot.state === 'paused') return 'paused';
  switch (snapshot.status) {
    case 'no_signer':
      return 'noSigner';
    case 'uncertain':
      return 'uncertain';
    case 'recognized':
      return 'recognized';
    default:
      return 'analyzing';
  }
}

/** Live status line plus the most recent trustworthy result. */
export function RecognitionPanel({ snapshot, latest, outputLanguage }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const key = statusKey(snapshot);
  const uncertain = key === 'uncertain';
  const sign = latest ? getSign(latest.label) : undefined;
  const meaning = sign ? signMeaning(sign, outputLanguage) : null;

  return (
    <View style={{ gap: spacing.md }}>
      <View
        testID="recognition-status"
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          uncertain && snapshot.reason
            ? `${t(`signToText.status.${key}`)} ${t(`signToText.hints.${snapshot.reason}`)}`
            : t(`signToText.status.${key}`)
        }
        style={[
          styles.status,
          {
            backgroundColor: uncertain ? colors.warningBackground : colors.surface,
            borderColor: uncertain ? colors.warning : colors.border,
            borderRadius: radii.md,
            padding: spacing.md,
            gap: spacing.md,
          },
        ]}
      >
        <Icon name={STATUS_ICONS[key]} color={uncertain ? colors.warning : colors.primary} size={28} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{t(`signToText.status.${key}`)}</AppText>
          {uncertain && snapshot.reason ? <AppText variant="body">{t(`signToText.hints.${snapshot.reason}`)}</AppText> : null}
        </View>
      </View>

      <View
        testID="recognition-result"
        style={[styles.result, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.xs }]}
      >
        {meaning && latest ? (
          <>
            <AppText variant="caption" color="textSecondary">
              {t('signToText.result.label')}
            </AppText>
            <AppText variant="display" accessibilityRole="text" testID="recognition-text">
              {meaning.text}
            </AppText>
            {latest.band ? (
              <AppText variant="caption" color="textSecondary">
                {t(`signToText.result.${latest.band}`)}
              </AppText>
            ) : null}
            {sign?.emergency ? <Notice tone="danger" message={t('signToText.result.emergency')} /> : null}
          </>
        ) : (
          <AppText variant="body" color="textSecondary">
            {t('signToText.result.empty')}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  result: { borderWidth: 1 },
  flex: { flex: 1 },
});
