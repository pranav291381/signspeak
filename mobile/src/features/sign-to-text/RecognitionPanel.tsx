import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, FadeIn, Icon, Notice, type IconName } from '@/components';
import type { SessionSnapshot } from '@/recognition/session';
import type { Recognition } from '@/recognition/types';
import { useTheme } from '@/theme';

import type { TranscriptWord } from './transcript';

type StatusKey = 'paused' | 'starting' | 'noSigner' | 'noHands' | 'analyzing' | 'uncertain' | 'recognized';

const STATUS_ICONS: Record<StatusKey, IconName> = {
  paused: 'pause-circle-outline',
  starting: 'progress-clock',
  noSigner: 'account-question-outline',
  noHands: 'hand-back-right-outline',
  analyzing: 'eye-outline',
  uncertain: 'help-circle-outline',
  recognized: 'check-circle-outline',
};

function statusKey(snapshot: SessionSnapshot | null, paused: boolean): StatusKey {
  if (paused || snapshot?.state === 'paused') return 'paused';
  if (!snapshot || snapshot.state !== 'running') return 'starting';
  switch (snapshot.status) {
    case 'no_signer':
      return 'noSigner';
    case 'no_hands':
      return 'noHands';
    case 'uncertain':
      return 'uncertain';
    case 'recognized':
      return 'recognized';
    default:
      return 'analyzing';
  }
}

interface Props {
  snapshot: SessionSnapshot | null;
  paused: boolean;
  latest: { recognition: Recognition; text: string; emergency: boolean } | null;
  transcript: TranscriptWord[];
}

/** Live status, the most recent trustworthy result, and everything recognized so far. */
export function RecognitionPanel({ snapshot, paused, latest, transcript }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const key = statusKey(snapshot, paused);
  const uncertain = key === 'uncertain';
  const hint = uncertain && snapshot?.reason ? t(`signToText.hints.${snapshot.reason}`) : null;

  return (
    <View style={{ gap: spacing.md }}>
      <View
        testID="recognition-status"
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={hint ? `${t(`signToText.status.${key}`)} ${hint}` : t(`signToText.status.${key}`)}
        style={[
          styles.status,
          {
            backgroundColor: uncertain ? colors.warningBackground : colors.surfaceAlt,
            borderRadius: radii.md,
            padding: spacing.md,
            gap: spacing.md,
          },
        ]}
      >
        <FadeIn trigger={key} distance={4} duration={180} style={[styles.status, styles.flex, { gap: spacing.md }]}>
          <Icon name={STATUS_ICONS[key]} color={uncertain ? colors.warning : colors.primary} size={22} />
          <View style={styles.flex}>
            <AppText variant="label">{t(`signToText.status.${key}`)}</AppText>
            {hint ? <AppText variant="caption">{hint}</AppText> : null}
          </View>
        </FadeIn>
      </View>

      <View testID="recognition-result" style={{ gap: spacing.xs, minHeight: 72, justifyContent: 'center' }}>
        {latest ? (
          <>
            <AppText variant="overline" color="textSecondary">
              {t('signToText.result.label')}
            </AppText>
            {/* Each new result pops in. */}
            <FadeIn trigger={latest.recognition.timestampMs} pop distance={6} duration={260}>
              <AppText variant="display" accessibilityRole="text" testID="recognition-text" style={{ fontSize: 40, lineHeight: 48 }}>
                {latest.text}
              </AppText>
            </FadeIn>
            {latest.recognition.band ? (
              <AppText variant="caption" color="textSecondary">
                {t(`signToText.result.${latest.recognition.band}`)}
              </AppText>
            ) : null}
            {latest.emergency ? <Notice tone="danger" message={t('signToText.result.emergency')} /> : null}
          </>
        ) : (
          <AppText variant="body" color="textSecondary" style={styles.center}>
            {t('signToText.result.empty')}
          </AppText>
        )}
      </View>

      {transcript.length > 1 ? (
        <View testID="transcript" accessible accessibilityLabel={transcript.map((w) => w.text).join(' ')} style={{ gap: spacing.sm }}>
          <AppText variant="overline" color="textSecondary">
            {t('signToText.transcript.label')}
          </AppText>
          <View style={[styles.words, { gap: spacing.xs }]}>
            {transcript.map((word, i) => (
              <FadeIn key={`${i}-${word.text}`} distance={4} duration={200}>
                <View
                  style={[
                    styles.word,
                    { borderRadius: radii.pill, backgroundColor: word.spelled ? colors.surfaceAlt : colors.primaryContainer },
                  ]}
                >
                  <AppText variant="label" style={{ color: word.spelled ? colors.text : colors.onPrimaryContainer }}>
                    {word.text}
                  </AppText>
                </View>
              </FadeIn>
            ))}
          </View>
          <AppText variant="caption" color="textSecondary">
            {t('signToText.transcript.note')}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  words: { flexDirection: 'row', flexWrap: 'wrap' },
  word: { paddingHorizontal: 12, paddingVertical: 6 },
});
