import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, FadeIn, Icon, LiveDot, Notice, PressableScale, type IconName } from '@/components';
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
  /** When not sure: the likeliest signs, to pick the one that was made. */
  suggestions?: { label: string; text: string }[];
  onChoose?: (label: string) => void;
  /** Opens teaching for a sign the app did not get on its own (it was chosen from the suggestions). */
  onTeach?: (label: string) => void;
}

/** Live status, the most recent trustworthy result, and everything recognized so far. */
export function RecognitionPanel({ snapshot, paused, latest, transcript, suggestions = [], onChoose, onTeach }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const key = statusKey(snapshot, paused);
  const uncertain = key === 'uncertain';
  const hint = uncertain && snapshot?.reason ? t(`signToText.hints.${snapshot.reason}`) : null;
  const live = key === 'analyzing' || key === 'recognized';
  const dot = uncertain ? colors.warning : live ? colors.success : key === 'paused' ? colors.outline : colors.accent;

  return (
    <View style={{ gap: spacing.lg }}>
      <View
        testID="recognition-status"
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={hint ? `${t(`signToText.status.${key}`)} ${hint}` : t(`signToText.status.${key}`)}
        style={[
          styles.status,
          {
            backgroundColor: uncertain ? colors.warningBackground : colors.surfaceAlt,
            borderRadius: hint ? radii.md + 2 : radii.pill,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 2,
            gap: spacing.sm + 2,
          },
        ]}
      >
        <LiveDot color={dot} pulsing={live || key === 'starting'} />
        <FadeIn trigger={key} distance={3} duration={180} style={[styles.status, styles.flex, { gap: spacing.sm }]}>
          <View style={styles.flex}>
            <AppText variant="label">{t(`signToText.status.${key}`)}</AppText>
            {hint ? <AppText variant="caption">{hint}</AppText> : null}
          </View>
          <Icon name={STATUS_ICONS[key]} color={uncertain ? colors.warning : colors.textSecondary} size={20} />
        </FadeIn>
      </View>

      {uncertain && suggestions.length > 0 && onChoose ? (
        <FadeIn trigger={suggestions.map((s) => s.label).join()} distance={6} duration={220}>
          <View testID="recognition-suggestions" style={{ gap: spacing.sm }}>
            <AppText variant="overline" color="textSecondary" accessibilityRole="header">
              {t('signToText.suggestions.title')}
            </AppText>
            <View style={[styles.words, { gap: spacing.sm }]}>
              {suggestions.map((s) => (
                <PressableScale
                  key={s.label}
                  testID={`suggestion-${s.label}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('signToText.suggestions.choose', { text: s.text })}
                  onPress={() => onChoose(s.label)}
                  style={[styles.suggestion, { borderRadius: radii.pill, backgroundColor: colors.primaryContainer }]}
                >
                  <AppText variant="bodyStrong" style={{ color: colors.onPrimaryContainer }}>
                    {s.text}
                  </AppText>
                </PressableScale>
              ))}
            </View>
          </View>
        </FadeIn>
      ) : null}

      <View testID="recognition-result" style={[styles.result, { gap: spacing.xs }]}>
        {latest ? (
          <>
            <AppText variant="overline" color="textSecondary">
              {t('signToText.result.label')}
            </AppText>
            {/* Each new result pops in. */}
            <FadeIn trigger={latest.recognition.timestampMs} pop distance={8} duration={280}>
              <AppText variant="display" accessibilityRole="text" testID="recognition-text" style={styles.resultText}>
                {latest.text}
              </AppText>
            </FadeIn>
            {latest.recognition.chosen ? (
              <View style={[styles.status, styles.words, { gap: spacing.xs }]}>
                <AppText variant="caption" color="textSecondary" testID="recognition-chosen">
                  {t('signToText.result.chosen')}
                </AppText>
                {onTeach ? (
                  <PressableScale
                    testID="recognition-teach"
                    accessibilityRole="button"
                    accessibilityLabel={t('signToText.teach.a11y', { text: latest.text })}
                    onPress={() => onTeach(latest.recognition.label)}
                    style={[styles.teach, { gap: spacing.xs }]}
                  >
                    <Icon name="hand-heart-outline" size={16} color={colors.primary} />
                    <AppText variant="label" style={{ color: colors.primary }}>
                      {t('signToText.teach.yourWay')}
                    </AppText>
                  </PressableScale>
                ) : null}
              </View>
            ) : latest.recognition.band ? (
              <AppText variant="caption" color="textSecondary">
                {t(`signToText.result.${latest.recognition.band}`)}
              </AppText>
            ) : null}
            {latest.emergency ? <Notice tone="danger" message={t('signToText.result.emergency')} /> : null}
            {key === 'recognized' && suggestions.length > 0 && onChoose ? (
              <View testID="recognition-alternatives" style={[styles.status, styles.words, { gap: spacing.xs, marginTop: spacing.xs }]}>
                <AppText variant="caption" color="textSecondary">
                  {t('signToText.suggestions.notRight')}
                </AppText>
                {suggestions.map((s) => (
                  <PressableScale
                    key={s.label}
                    testID={`alternative-${s.label}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('signToText.suggestions.instead', { text: s.text })}
                    onPress={() => onChoose(s.label)}
                    style={[styles.alternative, { borderRadius: radii.pill, borderColor: colors.outline }]}
                  >
                    <AppText variant="label">{s.text}</AppText>
                  </PressableScale>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <View style={[styles.empty, { gap: spacing.sm }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primaryContainer }]}>
              <Icon name="hand-wave-outline" size={24} color={colors.onPrimaryContainer} />
            </View>
            <AppText variant="body" color="textSecondary" style={styles.center}>
              {t('signToText.result.empty')}
            </AppText>
            {snapshot?.recognizer.mode === 'segment' ? (
              <AppText variant="caption" color="textSecondary" style={styles.center} testID="segment-hint">
                {t('signToText.result.segmentHint')}
              </AppText>
            ) : null}
          </View>
        )}
      </View>

      {transcript.length > 1 ? (
        <View testID="transcript" accessible accessibilityLabel={transcript.map((w) => w.text).join(' ')} style={{ gap: spacing.sm }}>
          <AppText variant="overline" color="textSecondary">
            {t('signToText.transcript.label')}
          </AppText>
          <View style={[styles.words, { gap: spacing.xs + 2 }]}>
            {transcript.map((word, i) => (
              <FadeIn key={`${i}-${word.text}`} distance={4} duration={200} pop>
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
  result: { minHeight: 96, justifyContent: 'center' },
  resultText: { fontSize: 44, lineHeight: 52, letterSpacing: -1 },
  empty: { alignItems: 'center', paddingVertical: 4 },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  words: { flexDirection: 'row', flexWrap: 'wrap' },
  word: { paddingHorizontal: 14, paddingVertical: 7 },
  suggestion: { paddingHorizontal: 18, minHeight: 48, justifyContent: 'center' },
  alternative: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderWidth: 1 },
  teach: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 4 },
});
