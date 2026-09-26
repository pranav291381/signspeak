import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { announce, confirmHaptic } from '@/accessibility/feedback';
import { useAppActive } from '@/accessibility/useAppActive';
import { AppText, Button, Notice, Screen, StateView } from '@/components';
import { getSign, signMeaning } from '@/content/library';
import { useHistory } from '@/history/HistoryProvider';
import type { SessionFactory } from '@/recognition/engine';
import type { Recognition } from '@/recognition/types';
import { useRecognition } from '@/recognition/useRecognition';
import type { CameraFacing } from '@/settings/settings';
import { useSettings } from '@/settings/SettingsProvider';
import { SpeakButton } from '@/speech/SpeakButton';
import { useSpeech } from '@/speech/useSpeech';
import { useTheme } from '@/theme';

import { CameraGate } from './CameraGate';
import { CameraPreview } from './CameraPreview';
import { RecognitionPanel } from './RecognitionPanel';

interface Props {
  /** Injected in tests. */
  sessionFactory?: SessionFactory;
}

export function SignToTextScreen({ sessionFactory }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { settings, updateSettings } = useSettings();
  const focused = useIsFocused();
  const appActive = useAppActive();

  const [facing, setFacing] = useState<CameraFacing>(settings.defaultCamera);
  const [userPaused, setUserPaused] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const visible = focused && appActive;

  const speech = useSpeech();
  const history = useHistory();
  const { outputLanguage, hapticsEnabled, autoSpeak, demoMode } = settings;
  const { speak } = speech;
  const { add: addToHistory } = history;
  const onRecognition = useCallback(
    (recognition: Recognition) => {
      const sign = getSign(recognition.label);
      if (!sign) return;
      const meaning = signMeaning(sign, outputLanguage);
      announce(t('signToText.a11y.recognized', { text: meaning.text }));
      confirmHaptic(hapticsEnabled);
      if (autoSpeak) void speak(meaning.text);
      // Simulated demo results are never saved as if they were real.
      if (!demoMode) {
        addToHistory({ kind: 'recognition', text: meaning.text, language: meaning.language, signIds: [sign.id] });
      }
    },
    [outputLanguage, hapticsEnabled, autoSpeak, demoMode, speak, addToHistory, t],
  );

  const { snapshot, results, clear, restart } = useRecognition({
    demoMode: settings.demoMode,
    active: visible && !userPaused && cameraReady && !cameraError,
    onRecognition,
    factory: sessionFactory,
  });

  if (!snapshot || snapshot.state === 'idle' || snapshot.state === 'loading') {
    return (
      <Screen>
        <StateView testID="recognition-loading" loading title={t('signToText.loading')} />
      </Screen>
    );
  }

  if (snapshot.state === 'model_unavailable') {
    return (
      <Screen>
        <StateView
          testID="model-unavailable"
          icon="information-outline"
          title={t('signToText.modelUnavailable.title')}
          message={t('signToText.modelUnavailable.message')}
          action={{
            label: t('signToText.modelUnavailable.tryDemo'),
            icon: 'flask-outline',
            onPress: () => updateSettings({ demoMode: true }),
          }}
          secondaryAction={{ label: t('common.goHome'), icon: 'home-outline', onPress: () => router.dismissTo('/') }}
        />
      </Screen>
    );
  }

  if (snapshot.state === 'model_error') {
    return (
      <Screen>
        <StateView
          testID="model-error"
          icon="alert-circle-outline"
          tone="danger"
          title={t('signToText.modelError.title')}
          message={t('signToText.modelError.message')}
          action={{ label: t('common.retry'), icon: 'refresh', onPress: restart }}
        />
      </Screen>
    );
  }

  const latest = results.at(-1) ?? null;
  const paused = userPaused || snapshot.state === 'paused';
  const meanings = results
    .map((r) => getSign(r.label))
    .filter((sign) => sign !== undefined)
    .map((sign) => signMeaning(sign, outputLanguage).text);
  const latestText = meanings.at(-1) ?? '';

  return (
    <Screen testID="sign-to-text-screen">
      {snapshot.simulated ? (
        <Notice
          testID="simulated-banner"
          tone="warning"
          icon="flask-outline"
          title={t('signToText.simulated.title')}
          message={t('signToText.simulated.message')}
        />
      ) : null}

      <CameraGate>
        {cameraError ? (
          <StateView
            testID="camera-error"
            icon="camera-off-outline"
            tone="danger"
            title={t('signToText.cameraError.title')}
            message={t('signToText.cameraError.message')}
            action={{
              label: t('common.retry'),
              icon: 'refresh',
              onPress: () => {
                setCameraError(null);
                setCameraReady(false);
              },
            }}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            <CameraPreview
              facing={facing}
              active={visible && !userPaused}
              onReady={() => setCameraReady(true)}
              onError={setCameraError}
            />
            <AppText variant="caption" color="textSecondary">
              {t('signToText.framing')}
            </AppText>
          </View>
        )}

        <RecognitionPanel snapshot={snapshot} latest={latest} outputLanguage={settings.outputLanguage} />

        <SpeakButton text={latestText} speech={speech} testID="speak-latest" />

        {meanings.length > 1 ? (
          <View testID="transcript" accessible style={{ gap: spacing.xs }}>
            <AppText variant="bodyStrong">{t('signToText.transcript.label')}</AppText>
            <AppText variant="body">{meanings.join(' · ')}</AppText>
            <AppText variant="caption" color="textSecondary">
              {t('signToText.transcript.note')}
            </AppText>
          </View>
        ) : null}

        <View style={[styles.controls, { gap: spacing.sm }]}>
          <View style={styles.control}>
            <Button
              testID="pause-toggle"
              label={paused ? t('signToText.controls.resume') : t('signToText.controls.pause')}
              icon={paused ? 'play' : 'pause'}
              variant="secondary"
              onPress={() => setUserPaused((p) => !p)}
            />
          </View>
          <View style={styles.control}>
            <Button
              testID="switch-camera"
              label={t('signToText.controls.switchCamera')}
              icon="camera-flip-outline"
              variant="secondary"
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            />
          </View>
          <View style={styles.control}>
            <Button
              testID="clear-results"
              label={t('signToText.controls.clear')}
              icon="eraser"
              variant="secondary"
              disabled={results.length === 0}
              onPress={clear}
            />
          </View>
        </View>
      </CameraGate>

      {snapshot.simulated ? (
        <Button
          variant="secondary"
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
  controls: { flexDirection: 'row', flexWrap: 'wrap' },
  control: { flexGrow: 1, flexBasis: 140 },
});
