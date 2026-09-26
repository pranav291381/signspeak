import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { AppText, Button, Notice, RadioGroup, Screen, Section, SwitchRow, type RadioOption } from '@/components';
import { selectableLanguages, type LanguageCode } from '@/i18n';
import { useProgress } from '@/learn/ProgressProvider';
import { useSettings } from '@/settings/SettingsProvider';
import type { CameraFacing, SpeechRate } from '@/settings/settings';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const { reset: resetProgress } = useProgress();

  const confirmResetProgress = () =>
    Alert.alert(t('settings.resetProgress.confirmTitle'), t('settings.resetProgress.confirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.resetProgress.label'), style: 'destructive', onPress: resetProgress },
    ]);

  const languageOptions: RadioOption<LanguageCode>[] = selectableLanguages().map((lang) => {
    const draft = lang.status === 'draft';
    const name = lang.nativeName === lang.englishName ? lang.nativeName : `${lang.nativeName} (${lang.englishName})`;
    return {
      value: lang.code,
      label: name,
      description: draft ? t('settings.draftTranslation') : undefined,
      accessibilityLabel: draft ? t('a11y.draftLanguage', { language: name }) : name,
    };
  });

  const speechRateOptions: RadioOption<SpeechRate>[] = [
    { value: 'slow', label: t('settings.speechRate.slow') },
    { value: 'normal', label: t('settings.speechRate.normal') },
    { value: 'fast', label: t('settings.speechRate.fast') },
  ];

  const cameraOptions: RadioOption<CameraFacing>[] = [
    { value: 'back', label: t('settings.defaultCamera.back') },
    { value: 'front', label: t('settings.defaultCamera.front') },
  ];

  return (
    <Screen testID="settings-screen">
      <Section title={t('settings.sections.language')}>
        <RadioGroup
          testID="app-language"
          label={t('settings.appLanguage.label')}
          hint={t('settings.appLanguage.hint')}
          options={languageOptions}
          value={settings.appLanguage}
          onChange={(appLanguage) => updateSettings({ appLanguage })}
        />
        <RadioGroup
          testID="output-language"
          label={t('settings.outputLanguage.label')}
          hint={t('settings.outputLanguage.hint')}
          options={languageOptions}
          value={settings.outputLanguage}
          onChange={(outputLanguage) => updateSettings({ outputLanguage })}
        />
      </Section>

      <Section title={t('settings.sections.speech')}>
        <SwitchRow
          testID="auto-speak"
          label={t('settings.autoSpeak.label')}
          hint={t('settings.autoSpeak.hint')}
          value={settings.autoSpeak}
          onValueChange={(autoSpeak) => updateSettings({ autoSpeak })}
        />
        <RadioGroup
          testID="speech-rate"
          label={t('settings.speechRate.label')}
          options={speechRateOptions}
          value={settings.speechRate}
          onChange={(speechRate) => updateSettings({ speechRate })}
        />
      </Section>

      <Section title={t('settings.sections.camera')}>
        <RadioGroup
          testID="default-camera"
          label={t('settings.defaultCamera.label')}
          options={cameraOptions}
          value={settings.defaultCamera}
          onChange={(defaultCamera) => updateSettings({ defaultCamera })}
        />
      </Section>

      <Section title={t('settings.sections.privacy')}>
        <SwitchRow
          testID="history-enabled"
          label={t('settings.history.label')}
          hint={t('settings.history.hint')}
          value={settings.historyEnabled}
          onValueChange={(historyEnabled) => updateSettings({ historyEnabled })}
        />
      </Section>

      <Section title={t('settings.sections.learning')}>
        <Button
          testID="reset-progress"
          variant="secondary"
          icon="restore"
          label={t('settings.resetProgress.label')}
          onPress={confirmResetProgress}
        />
      </Section>

      <Section title={t('settings.sections.accessibility')}>
        <SwitchRow
          testID="haptics-enabled"
          label={t('settings.haptics.label')}
          value={settings.hapticsEnabled}
          onValueChange={(hapticsEnabled) => updateSettings({ hapticsEnabled })}
        />
      </Section>

      <Section title={t('settings.sections.demo')}>
        <SwitchRow
          testID="demo-mode"
          label={t('settings.demoMode.label')}
          hint={t('settings.demoMode.hint')}
          value={settings.demoMode}
          onValueChange={(demoMode) => updateSettings({ demoMode })}
        />
      </Section>

      <Section title={t('settings.sections.about')}>
        <AppText variant="body">{t('settings.about.version', { version: Constants.expoConfig?.version ?? '—' })}</AppText>
        <Notice tone="warning" message={t('settings.about.limitations')} />
        <Notice tone="info" message={t('settings.about.notInterpreter')} />
        <Notice tone="info" icon="shield-lock-outline" message={t('settings.about.privacy')} />
      </Section>
    </Screen>
  );
}
