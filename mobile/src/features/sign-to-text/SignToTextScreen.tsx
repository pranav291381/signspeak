import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { announce, confirmHaptic } from '@/accessibility/feedback';
import { useAppActive } from '@/accessibility/useAppActive';
import { AppText, Button, Card, IconButton, Notice, Pill, Screen } from '@/components';
import { getSign, isEmergencySign, signMeaning } from '@/content/library';
import { EngineFrameSource } from '@/engine/EngineFrameSource';
import { useHistory } from '@/history/HistoryProvider';
import { LANGUAGES, type LanguageCode } from '@/i18n/languages';
import { targetText } from '@/personal/labels';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import type { SessionFactory } from '@/recognition/engine';
import { handsVisible } from '@/recognition/features';
import type { Recognition } from '@/recognition/types';
import { useRecognition } from '@/recognition/useRecognition';
import type { CameraFacing } from '@/settings/settings';
import { useSettings } from '@/settings/SettingsProvider';
import { useSignVocabulary } from '@/signpack/SignVocabularyProvider';
import { SpeakButton } from '@/speech/SpeakButton';
import { useSpeech } from '@/speech/useSpeech';
import { useTheme } from '@/theme';

import { CameraGate } from '../camera/CameraGate';
import { CameraStage } from '../camera/CameraStage';
import { RecognitionPanel } from './RecognitionPanel';
import { buildTranscript } from './transcript';

interface Props {
  /** Injected in tests. */
  sessionFactory?: SessionFactory;
}

interface Described {
  text: string;
  language: LanguageCode;
  letter: boolean;
  emergency: boolean;
}

const NO_REFERENCES: never[] = [];

export function SignToTextScreen({ sessionFactory }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { settings, updateSettings } = useSettings();
  const vocabularyState = useSignVocabulary();
  const { recognizable: taughtSigns, get: getTaught } = usePersonalSigns();
  const focused = useIsFocused();
  const appActive = useAppActive();

  const [facing, setFacing] = useState<CameraFacing>(settings.defaultCamera);
  const [userPaused, setUserPaused] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [flash, setFlash] = useState(0);
  const [live, setLive] = useState<'none' | 'person' | 'hands'>('none');
  const [source] = useState(() => new EngineFrameSource());

  const visible = focused && appActive;
  const { outputLanguage, hapticsEnabled, autoSpeak, demoMode } = settings;
  const vocabulary = vocabularyState.status === 'ready' ? vocabularyState.vocabulary : null;

  /** Text for a recognized label: a sign of the vocabulary, one taught on this phone, or a library sign (demo mode). */
  const describe = useCallback(
    (label: string): Described | null => {
      const sign = vocabulary?.describe(label);
      if (sign) return { text: sign.text, language: sign.language, letter: sign.letter, emergency: false };
      const taught = getTaught(label);
      if (taught) return { ...targetText(taught.target, outputLanguage), letter: taught.target.kind === 'letter', emergency: isEmergencySign(label) };
      const entry = getSign(label);
      return entry ? { ...signMeaning(entry, outputLanguage), letter: false, emergency: isEmergencySign(label) } : null;
    },
    [vocabulary, getTaught, outputLanguage],
  );
  const teachable = useMemo(() => new Set(vocabulary?.teachable.map((s) => s.label) ?? []), [vocabulary]);
  const teach = useCallback((label: string) => router.push({ pathname: '/signs/teach', params: { kind: 'vocabulary', label } }), [router]);
  const isDisplayable = useCallback((label: string) => describe(label) !== null, [describe]);

  const speech = useSpeech();
  const { speak } = speech;
  const { add: addToHistory } = useHistory();
  const onRecognition = useCallback(
    (recognition: Recognition) => {
      const described = describe(recognition.label);
      if (!described) return;
      announce(t('signToText.a11y.recognized', { text: described.text }));
      confirmHaptic(hapticsEnabled);
      setFlash((n) => n + 1);
      if (autoSpeak && !described.letter) void speak(described.text, described.language);
      // Simulated demo results are never saved as if they were real.
      if (!demoMode) {
        addToHistory({ kind: 'recognition', text: described.text, language: described.language, signIds: [recognition.label] });
      }
    },
    [describe, hapticsEnabled, autoSpeak, demoMode, speak, addToHistory, t],
  );

  const { snapshot, results, clear, restart, choose } = useRecognition({
    demoMode,
    signs: taughtSigns,
    vocabulary: vocabulary?.references ?? NO_REFERENCES,
    model: vocabulary?.model ?? null,
    source,
    isDisplayable,
    active: visible && !userPaused && (demoMode || cameraReady),
    onRecognition,
    factory: sessionFactory,
  });

  const entries = useMemo(
    () =>
      results
        .map((r) => ({ recognition: r, described: describe(r.label) }))
        .filter((e): e is { recognition: Recognition; described: NonNullable<ReturnType<typeof describe>> } => e.described !== null),
    [results, describe],
  );
  const transcript = useMemo(() => buildTranscript(entries.map((e) => e.described)), [entries]);
  const last = entries.at(-1);
  const latest = last ? { recognition: last.recognition, text: last.described.text, emergency: last.described.emergency } : null;
  const spokenText = transcript.map((w) => w.text).join(' ');
  const spokenLanguage = last?.described.language ?? outputLanguage;

  // Signs to choose from when the app is not sure (only ones it can show as text).
  const suggestions = useMemo(
    () =>
      (snapshot?.suggestions ?? []).flatMap((label) => {
        const described = describe(label);
        return described ? [{ label, text: described.text }] : [];
      }),
    [snapshot?.suggestions, describe],
  );

  const vocabularyLoading = !demoMode && (vocabularyState.status === 'idle' || vocabularyState.status === 'loading');
  const vocabularyMissing = !demoMode && vocabularyState.status === 'empty';
  const failed = snapshot?.state === 'model_error';
  // Dictionary words are shown as the dictionary gives them; say so if that is not the chosen output language.
  const shownLanguage = vocabulary && !vocabulary.languages.includes(outputLanguage) ? vocabulary.languages[0] : undefined;

  return (
    <Screen testID="sign-to-text-screen" title={t('screens.signToText')}>
      {snapshot?.simulated ? (
        <Notice
          testID="simulated-banner"
          tone="warning"
          icon="flask-outline"
          title={t('signToText.simulated.title')}
          message={t('signToText.simulated.message')}
        />
      ) : null}

      <CameraGate>
        <CameraStage
          testID="sign-camera"
          facing={facing}
          active={visible && !userPaused}
          onFrame={(timestampMs, values) => {
            source.push(timestampMs, values);
            // Instant feedback on what the camera sees, before recognition has enough frames.
            const next = values === null ? 'none' : handsVisible(values) ? 'hands' : 'person';
            setLive((current) => (current === next ? current : next));
          }}
          onReadyChange={setCameraReady}
          flashSignal={flash}
          model={source.model}
          overlayTop={
            <>
              {userPaused || snapshot?.simulated ? (
                <Pill
                  tone="overlay"
                  icon={userPaused ? 'pause' : 'flask-outline'}
                  label={userPaused ? t('signToText.status.paused') : t('signToText.demoLive')}
                />
              ) : (
                <Pill
                  testID="live-tracking"
                  tone={live === 'hands' ? 'success' : 'warning'}
                  icon={live === 'hands' ? 'check' : 'alert-outline'}
                  label={
                    live === 'hands' ? t('teach.live.hands') : live === 'person' ? t('teach.live.noHands') : t('teach.live.noPerson')
                  }
                />
              )}
              <View style={styles.flex} />
            </>
          }
          overlayBottom={
            <View style={[styles.controls, { gap: spacing.lg }]}>
              <View style={styles.controlSide} />
              <IconButton
                testID="pause-toggle"
                variant="accent"
                size={62}
                icon={userPaused ? 'play' : 'pause'}
                accessibilityLabel={userPaused ? t('signToText.controls.resume') : t('signToText.controls.pause')}
                onPress={() => setUserPaused((p) => !p)}
              />
              <View style={styles.controlSide}>
                <IconButton
                  testID="switch-camera"
                  variant="overlay"
                  icon="camera-flip-outline"
                  accessibilityLabel={t('signToText.controls.switchCamera')}
                  onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                />
              </View>
            </View>
          }
        />
      </CameraGate>

      {vocabularyLoading ? (
        <Card testID="vocabulary-loading">
          <AppText variant="body" color="textSecondary">
            {t('signToText.vocabulary.loading')}
          </AppText>
        </Card>
      ) : vocabularyMissing ? (
        <Card tone="tinted" testID="vocabulary-missing">
          <AppText variant="heading">{t('signToText.vocabulary.missingTitle')}</AppText>
          <AppText variant="body">{t('signToText.vocabulary.missingMessage')}</AppText>
          <Button
            testID="try-demo"
            variant="ghost"
            icon="flask-outline"
            label={t('signToText.modelUnavailable.tryDemo')}
            onPress={() => updateSettings({ demoMode: true })}
          />
        </Card>
      ) : failed ? (
        <Card testID="model-error">
          <Notice tone="danger" title={t('signToText.modelError.title')} message={t('signToText.modelError.message')} />
          <Button icon="refresh" label={t('common.retry')} onPress={restart} />
        </Card>
      ) : (
        <Card style={{ gap: spacing.lg }}>
          <RecognitionPanel
            snapshot={snapshot}
            paused={userPaused}
            latest={latest}
            transcript={transcript}
            suggestions={suggestions}
            onChoose={choose}
            onTeach={latest && !demoMode && teachable.has(latest.recognition.label) ? teach : undefined}
          />
          <View style={[styles.row, { gap: spacing.sm }]}>
            <View style={styles.flex}>
              <SpeakButton text={spokenText} language={spokenLanguage} speech={speech} testID="speak-transcript" />
            </View>
            <IconButton
              testID="clear-results"
              size={54}
              icon="eraser"
              accessibilityLabel={t('signToText.controls.clear')}
              disabled={results.length === 0}
              onPress={clear}
            />
          </View>
          {latest ? (
            <Button
              testID="report-wrong"
              size="sm"
              variant="ghost"
              icon="message-alert-outline"
              label={t('signToText.reportWrong')}
              onPress={() =>
                router.push({
                  pathname: '/feedback',
                  params: {
                    feature: 'sign_to_text',
                    issue: 'wrong_recognition',
                    label: latest.recognition.label,
                    simulated: String(snapshot?.simulated ?? false),
                  },
                })
              }
            />
          ) : null}
        </Card>
      )}

      {vocabulary && !demoMode ? (
        <AppText variant="caption" color="textSecondary" testID="vocabulary-info">
          {t('signToText.vocabulary.info', {
            count: vocabulary.size,
            source: vocabulary.packs.map((p) => p.source.name).join(', '),
          })}
          {shownLanguage ? ` ${t('signToText.vocabulary.language', { language: LANGUAGES[shownLanguage].nativeName })}` : ''}
        </AppText>
      ) : null}

      {!demoMode && (teachable.size > 0 || taughtSigns.length > 0) ? (
        <Button
          testID="teach-your-signs"
          variant="ghost"
          size="sm"
          icon="school-outline"
          label={taughtSigns.length > 0 ? t('signToText.teach.manage', { count: taughtSigns.length }) : t('signToText.teach.link')}
          onPress={() => router.push('/signs')}
        />
      ) : null}

      {snapshot?.simulated ? (
        <Button
          variant="outline"
          label={t('signToText.simulated.turnOff')}
          icon="flask-off-outline"
          onPress={() => updateSettings({ demoMode: false })}
          testID="demo-mode-off"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  controlSide: { width: 48, alignItems: 'center' },
});
