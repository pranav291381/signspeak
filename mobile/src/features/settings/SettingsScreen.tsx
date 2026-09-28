import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, StyleSheet, View } from 'react-native';

import {
  AppText,
  Card,
  confirmAction,
  IconTile,
  ListRow,
  Notice,
  RadioGroup,
  Screen,
  Section,
  SegmentedControl,
  SwitchRow,
  type IconName,
  type RadioOption,
} from '@/components';
import { selectableLanguages, type LanguageCode } from '@/i18n';
import { useMotionLibrary } from '@/motion/MotionLibraryProvider';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { useSettings } from '@/settings/SettingsProvider';
import { useSignVocabulary } from '@/signpack/SignVocabularyProvider';
import type { CameraFacing, SpeechRate } from '@/settings/settings';
import { useTheme, type TileColor } from '@/theme';

const LOGO = require('../../../assets/logo.png');

/** A control under its own label and icon (a choice that does not fit on one row). */
function LabelledControl({ icon, tile, label, children }: { icon: IconName; tile: TileColor; label: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <IconTile icon={icon} tile={tile} />
        <AppText variant="bodyStrong" style={styles.flex}>
          {label}
        </AppText>
      </View>
      {children}
    </View>
  );
}

/** The app's name, logo and version at the top of Settings. */
function AppCard() {
  const { t } = useTranslation();
  const { radii, spacing } = useTheme();
  return (
    <Card style={[styles.row, { gap: spacing.lg }]}>
      <Image source={LOGO} style={[styles.logo, { borderRadius: radii.md + 2 }]} accessible={false} accessibilityIgnoresInvertColors />
      <View style={styles.flex}>
        <AppText variant="heading">{t('home.title')}</AppText>
        <AppText variant="caption" color="textSecondary">
          {t('settings.about.version', { version: Constants.expoConfig?.version ?? '—' })}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {t('home.intro')}
        </AppText>
      </View>
    </Card>
  );
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { settings, updateSettings } = useSettings();
  const { signs, removeAll } = usePersonalSigns();
  const vocabulary = useSignVocabulary();
  const vocabularyPacks = vocabulary.status === 'ready' ? vocabulary.vocabulary.packs : [];
  const motion = useMotionLibrary();
  const motionPacks = motion.status === 'ready' ? motion.library.packs : [];

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
      <AppCard />

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

      <Section title={t('settings.sections.speech')} variant="list">
        <SwitchRow
          testID="auto-speak"
          icon="account-voice"
          tile="violet"
          label={t('settings.autoSpeak.label')}
          hint={t('settings.autoSpeak.hint')}
          value={settings.autoSpeak}
          onValueChange={(autoSpeak) => updateSettings({ autoSpeak })}
        />
        <LabelledControl icon="speedometer" tile="blue" label={t('settings.speechRate.label')}>
          <SegmentedControl
            testID="speech-rate"
            label={t('settings.speechRate.label')}
            segments={speechRates}
            value={settings.speechRate}
            onChange={(speechRate) => updateSettings({ speechRate })}
          />
        </LabelledControl>
      </Section>

      <Section title={t('settings.sections.camera')} variant="list">
        <LabelledControl icon="camera-outline" tile="ink" label={t('settings.defaultCamera.label')}>
          <SegmentedControl
            testID="default-camera"
            label={t('settings.defaultCamera.label')}
            segments={cameras}
            value={settings.defaultCamera}
            onChange={(defaultCamera) => updateSettings({ defaultCamera })}
          />
        </LabelledControl>
      </Section>

      {signs.length > 0 ? (
        // Teaching signs is paused; signs taught earlier can still be deleted.
        <Section title={t('settings.sections.signs')} description={t('settings.signs.hint')} variant="list">
          <ListRow
            testID="settings-delete-signs"
            icon="delete-outline"
            tile="rose"
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

      <Section title={t('settings.sections.privacy')} variant="list">
        <SwitchRow
          testID="history-enabled"
          icon="shield-lock-outline"
          tile="green"
          label={t('settings.history.label')}
          hint={t('settings.history.hint')}
          value={settings.historyEnabled}
          onValueChange={(historyEnabled) => updateSettings({ historyEnabled })}
        />
        <ListRow testID="settings-history" icon="history" tile="teal" label={t('screens.history')} onPress={() => router.push('/history')} />
      </Section>

      <Section title={t('settings.sections.accessibility')} variant="list">
        <SwitchRow
          testID="haptics-enabled"
          icon="vibrate"
          tile="blue"
          label={t('settings.haptics.label')}
          value={settings.hapticsEnabled}
          onValueChange={(hapticsEnabled) => updateSettings({ hapticsEnabled })}
        />
      </Section>

      <Section title={t('settings.sections.demo')} variant="list">
        <SwitchRow
          testID="demo-mode"
          icon="flask-outline"
          tile="slate"
          label={t('settings.demoMode.label')}
          hint={t('settings.demoMode.hint')}
          value={settings.demoMode}
          onValueChange={(demoMode) => updateSettings({ demoMode })}
        />
      </Section>

      <Section title={t('settings.sections.feedback')} variant="list">
        <ListRow
          testID="report-problem"
          icon="message-alert-outline"
          tile="rose"
          label={t('settings.reportProblem')}
          onPress={() => router.push('/feedback')}
        />
      </Section>

      <Section title={t('settings.sections.about')}>
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
              tile="saffron"
              label={pack.name}
              description={`${pack.source.name}. ${pack.source.permission}`}
              value={t('settings.about.vocabularySigns', { count: pack.signCount })}
              onPress={() => void Linking.openURL(pack.source.url)}
            />
          ))
        )}
        {motionPacks.length > 0 ? (
          <>
            <AppText variant="bodyStrong">{t('settings.about.motions')}</AppText>
            {motionPacks.map((pack) => (
              <ListRow
                key={pack.id}
                testID={`about-motions-${pack.id}`}
                icon="human-greeting-variant"
                tile="teal"
                label={pack.name}
                description={`${pack.source.name}. ${pack.source.permission}`}
                value={t('settings.about.vocabularySigns', { count: pack.signCount })}
                onPress={() => void Linking.openURL(pack.source.url)}
              />
            ))}
          </>
        ) : null}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  logo: { width: 56, height: 56 },
});
