import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Notice } from '@/components';
import { LANGUAGES } from '@/i18n/languages';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

import type { SpeechController } from './useSpeech';

interface Props {
  text: string;
  speech: SpeechController;
  testID?: string;
}

/** Speak / Stop toggle with visible, non-audio feedback when speech fails. */
export function SpeakButton({ text, speech, testID }: Props) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { spacing } = useTheme();
  const language = LANGUAGES[settings.outputLanguage].nativeName;
  const problem = speech.problem;

  let message: string | null = null;
  if (problem?.status === 'unsupported_language') message = t('speech.unsupported', { language });
  else if (problem?.status === 'engine_unavailable') message = t('speech.engineUnavailable');
  else if (problem?.status === 'error') message = t('speech.error');

  return (
    <View style={{ gap: spacing.sm }}>
      <Button
        testID={testID}
        label={speech.speaking ? t('speech.stop') : t('speech.speak')}
        icon={speech.speaking ? 'stop' : 'volume-high'}
        accessibilityHint={t('speech.a11yHint', { language })}
        disabled={!text.trim()}
        onPress={() => (speech.speaking ? speech.stop() : void speech.speak(text))}
      />
      {message ? <Notice tone="warning" icon="volume-off" message={message} testID="speech-problem" /> : null}
    </View>
  );
}
