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
import { signText } from '@/personal/labels';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { isEmergencyLabel, type SessionFactory } from '@/recognition/engine';
import type { Recognition } from '@/recognition/types';
import { useRecognition } from '@/recognition/useRecognition';
import type { CameraFacing } from '@/settings/settings';
import { useSettings } from '@/settings/SettingsProvider';
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

export function SignToTextScreen({ sessionFactory }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { settings, updateSettings } = useSettings();
  const { ready: signsLoaded, recognizable, get } = usePersonalSigns();
  const focused = useIsFocused();
  const appActive = useAppActive();

  const [facing, setFacing] = useState<CameraFacing>(settings.defaultCamera);
  const [userPaused, setUserPaused] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [flash, setFlash] = useState(0);
  const [source] = useState(() => new EngineFrameSource());

  const visible = focused && appActive;
  const { outputLanguage, hapticsEnabled, autoSpeak, demoMode } = settings;
  const personal = !demoMode;
  const hasSigns = recognizable.length > 0;

  /** Text for a recognized label: a personal sign, or a library sign (demo mode). */
  const describe = useCallback(
    (label: string): { text: string; letter: boolean; emergency: boolean } | null => {
      const sign = get(label);
      if (sign) return { text: signText(sign, outputLanguage), letter: sign.target.kind === 'letter', emergency: isEmergencyLabel(label) };
      const entry = getSign(label);
      return entry ? { text: signMeaning(entry, outputLanguage).text, letter: false, emergency: isEmergencySign(label) } : null;
    },
    [get, outputLanguage],
  );
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
      if (autoSpeak && !described.letter) void speak(described.text);
      // Simulated demo results are never saved as if they were real.
      if (!demoMode) {
        addToHistory({ kind: 'recognition', text: described.text, language: outputLanguage, signIds: [recognition.label] });
      }
    },
    [describe, hapticsEnabled, autoSpeak, demoMode, speak, addToHistory, outputLanguage, t],
  );

  const { snapshot, results, clear, restart } = useRecognition({
    demoMode,
    signs: recognizable,
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

  const needsSigns = personal && signsLoaded && !hasSigns;
  const failed = snapshot?.state === 'model_error';

  return (
    <Screen
      testID="sign-to-text-screen"
      title={t('screens.signToText')}
      headerAction={
        <IconButton
          testID="open-my-signs"
          icon="hand-back-right-outline"
          accessibilityLabel={t('screens.mySigns')}
          onPress={() => router.push('/signs')}
        />
      }
    >
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
          onFrame={(timestampMs, values) => source.push(timestampMs, values)}
          onReadyChange={setCameraReady}
          flashSignal={flash}
          overlayTop={
            <>
              <Pill
                tone="overlay"
                icon={userPaused ? 'pause' : 'circle'}
                label={userPaused ? t('signToText.status.paused') : snapshot?.simulated ? t('signToText.demoLive') : t('signToText.live')}
              />
              <View style={styles.flex} />
            </>
          }
          overlayBottom={
            <View style={[styles.controls, { gap: spacing.md }]}>
              <IconButton
                testID="pause-toggle"
                variant="overlay"
                icon={userPaused ? 'play' : 'pause'}
                accessibilityLabel={userPaused ? t('signToText.controls.resume') : t('signToText.controls.pause')}
                onPress={() => setUserPaused((p) => !p)}
              />
              <IconButton
                testID="switch-camera"
                variant="overlay"
                icon="camera-flip-outline"
                accessibilityLabel={t('signToText.controls.switchCamera')}
                onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              />
            </View>
          }
        />
      </CameraGate>

      {needsSigns ? (
        <Card tone="tinted" testID="teach-first">
          <AppText variant="heading">{t('signToText.teachFirst.title')}</AppText>
          <AppText variant="body">{t('signToText.teachFirst.message')}</AppText>
          <Button testID="teach-first-sign" icon="plus" label={t('signToText.teachFirst.teach')} onPress={() => router.push('/signs/teach')} />
          <Button
            testID="teach-first-alphabet"
            variant="outline"
            icon="alphabetical-variant"
            label={t('signToText.teachFirst.alphabet')}
            onPress={() => router.push({ pathname: '/signs/teach', params: { kind: 'alphabet' } })}
          />
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
        <Card>
          <RecognitionPanel snapshot={snapshot} paused={userPaused} latest={latest} transcript={transcript} />
          <SpeakButton text={spokenText} speech={speech} testID="speak-transcript" />
          <View style={[styles.row, { gap: spacing.sm }]}>
            <View style={styles.flex}>
              <Button
                testID="clear-results"
                size="sm"
                variant="secondary"
                icon="eraser"
                label={t('signToText.controls.clear')}
                disabled={results.length === 0}
                onPress={clear}
              />
            </View>
            {latest ? (
              <View style={styles.flex}>
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
              </View>
            ) : null}
          </View>
        </Card>
      )}

      {personal && hasSigns ? (
        <AppText variant="caption" color="textSecondary" testID="known-signs">
          {t('signToText.knownSigns', { count: recognizable.length })}
        </AppText>
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
  row: { flexDirection: 'row' },
  controls: { flexDirection: 'row', justifyContent: 'center' },
});
