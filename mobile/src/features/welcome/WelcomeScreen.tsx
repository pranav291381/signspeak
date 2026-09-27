import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, Notice, RadioGroup, Screen, type IconName, type RadioOption } from '@/components';
import { selectableLanguages, type LanguageCode } from '@/i18n';
import { useSettings } from '@/settings/SettingsProvider';
import { darkColors, lightColors, useTheme, type ColorPalette, type ThemePreference } from '@/theme';

type Step = 'language' | 'appearance' | 'intro';
const STEPS: Step[] = ['language', 'appearance', 'intro'];

/** First launch: app language, light/dark appearance, and what the app does. */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { settings, updateSettings } = useSettings();
  const [step, setStep] = useState<Step>('language');
  const index = STEPS.indexOf(step);

  const finish = () => {
    updateSettings({ onboardingComplete: true });
    router.replace('/');
  };

  return (
    <Screen testID="welcome-screen" edges={['top', 'bottom', 'left', 'right']}>
      <StepDots index={index} />
      {step === 'language' ? (
        <LanguageStep
          value={settings.appLanguage}
          // At first launch the output language follows; it can differ later in Settings.
          onChange={(language) => updateSettings({ appLanguage: language, outputLanguage: language })}
        />
      ) : null}
      {step === 'appearance' ? (
        <AppearanceStep value={settings.theme} onChange={(theme) => updateSettings({ theme })} />
      ) : null}
      {step === 'intro' ? <IntroStep /> : null}

      <View style={{ flexGrow: 1 }} />
      <View style={{ gap: spacing.sm }}>
        <Button
          testID="welcome-next"
          label={step === 'intro' ? t('welcome.start') : t('welcome.continue')}
          icon={step === 'intro' ? 'check' : 'arrow-right'}
          onPress={() => (step === 'intro' ? finish() : setStep(STEPS[index + 1]!))}
        />
        {index > 0 ? (
          <Button variant="ghost" label={t('welcome.back')} onPress={() => setStep(STEPS[index - 1]!)} />
        ) : null}
      </View>
    </Screen>
  );
}

function StepDots({ index }: { index: number }) {
  const { t } = useTranslation();
  const { colors, radii } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={t('welcome.step', { current: index + 1, total: STEPS.length })}
      style={styles.dots}
    >
      {STEPS.map((step, i) => (
        <View
          key={step}
          style={{
            height: 6,
            width: i === index ? 28 : 6,
            borderRadius: radii.pill,
            backgroundColor: i <= index ? colors.primary : colors.outline,
          }}
        />
      ))}
    </View>
  );
}

function LanguageStep({ value, onChange }: { value: LanguageCode; onChange: (code: LanguageCode) => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const options: RadioOption<LanguageCode>[] = selectableLanguages().map((lang) => {
    const draft = lang.status === 'draft';
    const name = lang.nativeName === lang.englishName ? lang.nativeName : `${lang.nativeName} (${lang.englishName})`;
    return {
      value: lang.code,
      label: name,
      description: draft ? t('settings.draftTranslation') : undefined,
      accessibilityLabel: draft ? t('a11y.draftLanguage', { language: name }) : name,
    };
  });
  return (
    <View style={{ gap: spacing.lg }}>
      <Hero icon="hand-wave" title={t('welcome.title')} subtitle={t('welcome.languagePrompt')} />
      <RadioGroup
        testID="welcome-language"
        label={t('settings.appLanguage.label')}
        hint={t('welcome.languageHint')}
        options={options}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}

function AppearanceStep({ value, onChange }: { value: ThemePreference; onChange: (value: ThemePreference) => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const choices: { value: ThemePreference; label: string; icon: IconName }[] = [
    { value: 'light', label: t('settings.theme.light'), icon: 'white-balance-sunny' },
    { value: 'dark', label: t('settings.theme.dark'), icon: 'weather-night' },
    { value: 'system', label: t('settings.theme.system'), icon: 'theme-light-dark' },
  ];
  return (
    <View style={{ gap: spacing.lg }}>
      <Hero icon="palette-outline" title={t('welcome.appearanceTitle')} subtitle={t('welcome.appearanceHint')} />
      <View accessibilityRole="radiogroup" accessibilityLabel={t('settings.theme.label')} style={[styles.row, { gap: spacing.sm }]}>
        {choices.map((choice) => (
          <ThemeCard
            key={choice.value}
            label={choice.label}
            icon={choice.icon}
            preview={choice.value === 'dark' ? darkColors : choice.value === 'light' ? lightColors : null}
            selected={value === choice.value}
            onPress={() => onChange(choice.value)}
            testID={`welcome-theme-${choice.value}`}
          />
        ))}
      </View>
    </View>
  );
}

/** A miniature screen in the given colours; half light, half dark for "system". */
function ThemeCard({
  label,
  icon,
  preview,
  selected,
  onPress,
  testID,
}: {
  label: string;
  icon: IconName;
  preview: ColorPalette | null;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors, radii, spacing } = useTheme();
  const mini = (palette: ColorPalette, half?: 'left' | 'right') => (
    <View style={[styles.mini, half ? { width: '50%' } : null, { backgroundColor: palette.background }]}>
      <View style={[styles.miniBar, { backgroundColor: palette.primary }]} />
      <View style={[styles.miniCard, { backgroundColor: palette.surface, borderColor: palette.border }]} />
      <View style={[styles.miniCard, { backgroundColor: palette.surface, borderColor: palette.border }]} />
    </View>
  );
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      onPress={onPress}
      style={[
        styles.themeCard,
        {
          borderRadius: radii.lg,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
          backgroundColor: colors.surface,
          padding: spacing.sm,
          gap: spacing.sm,
        },
      ]}
    >
      <View style={[styles.previewFrame, { borderRadius: radii.md }]}>
        {preview ? mini(preview) : (
          <View style={styles.row}>
            {mini(lightColors, 'left')}
            {mini(darkColors, 'right')}
          </View>
        )}
      </View>
      <View style={styles.themeLabel}>
        <Icon name={selected ? 'check-circle' : icon} size={18} color={selected ? colors.primary : colors.textSecondary} />
        <AppText variant="label">{label}</AppText>
      </View>
    </Pressable>
  );
}

function IntroStep() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const points: { icon: IconName; title: string; body: string }[] = [
    { icon: 'hand-wave-outline', title: t('welcome.intro.signTitle'), body: t('welcome.intro.signBody') },
    { icon: 'message-text-outline', title: t('welcome.intro.textTitle'), body: t('welcome.intro.textBody') },
    { icon: 'shield-lock-outline', title: t('welcome.intro.privacyTitle'), body: t('welcome.intro.privacyBody') },
  ];
  return (
    <View style={{ gap: spacing.lg }}>
      <Hero icon="rocket-launch-outline" title={t('welcome.intro.title')} subtitle={t('welcome.intro.subtitle')} />
      {points.map((point) => (
        <View key={point.title} style={[styles.point, { gap: spacing.md }]}>
          <View style={[styles.pointIcon, { backgroundColor: colors.primaryContainer, borderRadius: radii.md }]}>
            <Icon name={point.icon} size={22} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{point.title}</AppText>
            <AppText variant="caption" color="textSecondary">
              {point.body}
            </AppText>
          </View>
        </View>
      ))}
      <Notice tone="info" message={t('home.disclaimer')} />
    </View>
  );
}

function Hero({ icon, title, subtitle }: { icon: IconName; title: string; subtitle: string }) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={[styles.heroIcon, { backgroundColor: colors.primary, borderRadius: radii.lg }]}>
        <Icon name={icon} size={30} color={colors.onPrimary} />
      </View>
      <AppText variant="display">{title}</AppText>
      <AppText variant="body" color="textSecondary">
        {subtitle}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingTop: 8 },
  row: { flexDirection: 'row' },
  flex: { flex: 1 },
  themeCard: { flex: 1 },
  previewFrame: { overflow: 'hidden', aspectRatio: 0.8 },
  mini: { flex: 1, padding: 6, gap: 5 },
  miniBar: { height: 8, width: '60%', borderRadius: 4 },
  miniCard: { height: 18, borderRadius: 5, borderWidth: 1 },
  themeLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  point: { flexDirection: 'row', alignItems: 'flex-start' },
  pointIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heroIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});
