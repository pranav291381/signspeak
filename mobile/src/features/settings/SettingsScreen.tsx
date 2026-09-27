import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import {
  AppText,
  confirmAction,
  ListRow,
  Notice,
  RadioGroup,
  Screen,
  Section,
  SegmentedControl,
  SwitchRow,
  type RadioOption,
} from '@/components';
import { selectableLanguages, type LanguageCode } from '@/i18n';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { useSettings } from '@/settings/SettingsProvider';
import { useSignVocabulary } from '@/signpack/SignVocabularyProvider';
import type { CameraFacing, SpeechRate } from '@/settings/settings';

export function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { settings, updateSettings } = useSettings();
  const { signs, removeAll } = usePersonalSigns();
  const vocabulary = useSignVocabulary();
  const vocabularyPacks = vocabulary.status === 'ready' ? vocabulary.vocabulary.packs : [];

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

  const speechRates: { value: SpeechRate; label: string }[] = [
    { value: 'slow', label: t('settings.speechRate.slow') },
    { value: 'normal', label: t('settings.speechRate.normal') },
    { value: 'fast', label: t('settings.speechRate.fast') },
  ];

  const cameras: { value: CameraFacing; label: string }[] = [
    { value: 'back', label: t('settings.defaultCamera.back') },
    { value: 'front', label: t('settings.defaultCamera.front') },
  ];

  return (
    <Screen testID="settings-screen" title={t('screens.settings')}>
      <Section title={t('settings.sections.appearance')} description={t('settings.theme.hint')}>
        <SegmentedControl
          testID="theme"
          label={t('settings.theme.label')}
          value={settings.theme}
          onChange={(theme) => updateSettings({ theme })}
          segments={[
            { value: 'system', label: t('settings.theme.system'), icon: 'theme-light-dark' },
            { value: 'light', label: t('settings.theme.light'), icon: 'white-balance-sunny' },
            { value: 'dark', label: t('settings.theme.dark'), icon: 'weather-night' },
          ]}
        />
      </Section>

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
        <AppText variant="bodyStrong">{t('settings.speechRate.label')}</AppText>
        <SegmentedControl
          testID="speech-rate"
          label={t('settings.speechRate.label')}
          segments={speechRates}
          value={settings.speechRate}
          onChange={(speechRate) => updateSettings({ speechRate })}
        />
      </Section>

      <Section title={t('settings.sections.camera')}>
        <AppText variant="bodyStrong">{t('settings.defaultCamera.label')}</AppText>
        <SegmentedControl
          testID="default-camera"
          label={t('settings.defaultCamera.label')}
          segments={cameras}
          value={settings.defaultCamera}
          onChange={(defaultCamera) => updateSettings({ defaultCamera })}
        />
      </Section>

      {signs.length > 0 ? (
        // Teaching signs is paused; signs taught earlier can still be deleted.
        <Section title={t('settings.sections.signs')} description={t('settings.signs.hint')}>
          <ListRow
            testID="settings-delete-signs"
            icon="delete-outline"
            tone="danger"
            label={t('signs.deleteAll')}
            value={String(signs.length)}
            onPress={() =>
              confirmAction({
                title: t('signs.deleteAllTitle'),
                message: t('signs.deleteAllMessage'),
                confirmLabel: t('signs.deleteAll'),
                cancelLabel: t('common.cancel'),
                onConfirm: () => void removeAll(),
              })
            }
          />
        </Section>
      ) : null}

      <Section title={t('settings.sections.privacy')}>
        <SwitchRow
          testID="history-enabled"
          label={t('settings.history.label')}
          hint={t('settings.history.hint')}
          value={settings.historyEnabled}
          onValueChange={(historyEnabled) => updateSettings({ historyEnabled })}
        />
        <ListRow testID="settings-history" icon="history" label={t('screens.history')} onPress={() => router.push('/history')} />
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

      <Section title={t('settings.sections.feedback')}>
        <ListRow
          testID="report-problem"
          icon="message-alert-outline"
          label={t('settings.reportProblem')}
          onPress={() => router.push('/feedback')}
        />
      </Section>

      <Section title={t('settings.sections.about')}>
        <AppText variant="body">{t('settings.about.version', { version: Constants.expoConfig?.version ?? '—' })}</AppText>
        <Notice tone="warning" message={t('settings.about.limitations')} />
        <Notice tone="info" message={t('settings.about.notInterpreter')} />
        <Notice tone="info" icon="shield-lock-outline" message={t('settings.about.privacy')} />
        <AppText variant="bodyStrong">{t('settings.about.vocabulary')}</AppText>
        {vocabularyPacks.length === 0 ? (
          <AppText variant="caption" color="textSecondary" testID="about-no-vocabulary">
            {t('settings.about.noVocabulary')}
          </AppText>
        ) : (
          // Credit for the sign data, with its licence and what was changed (e.g. CC BY).
          vocabularyPacks.map((pack) => (
            <ListRow
              key={pack.id}
              testID={`about-vocabulary-${pack.id}`}
              icon="book-open-variant"
              label={pack.name}
              description={`${pack.source.name}. ${pack.source.permission}`}
              value={t('settings.about.vocabularySigns', { count: pack.signCount })}
              onPress={() => void Linking.openURL(pack.source.url)}
            />
          ))
        )}
      </Section>
    </Screen>
  );
}
