import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, FadeIn, Notice, PressableScale, Screen, Section, TextField } from '@/components';
import { MAX_QUERY_LENGTH } from '@/content/matcher';
import { useHistory } from '@/history/HistoryProvider';
import { useMotionLibrary } from '@/motion/MotionLibraryProvider';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

import { planSigns, type SignPlan } from './plan';
import { SentencePlayer } from './SentencePlayer';
import { SignCards } from './SignCards';
import { SignDictionary } from './SignDictionary';
import { applySuggestion, EXAMPLES, suggestSigns } from './suggest';

const categoryKey = (category: string) => category.toLowerCase().replace(/[^a-z]+/g, '_');

/**
 * Text → ISL: typed English words shown as signs recorded by Deaf signers,
 * played one after another as a smooth movement, with a still diagram of each.
 */
export function TextToIslScreen() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { settings } = useSettings();
  const { signs, get } = usePersonalSigns();
  const history = useHistory();
  const motion = useMotionLibrary();
  const library = motion.status === 'ready' ? motion.library : null;
  const loading = motion.status === 'idle' || motion.status === 'loading';
  const language = settings.appLanguage;

  const [text, setText] = useState('');
  const [plan, setPlan] = useState<SignPlan | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [version, setVersion] = useState(0);
  const [empty, setEmpty] = useState(false);
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [shownText, setShownText] = useState<string | null>(null);

  const sources = useMemo(() => ({ library, signs, get, language }), [library, signs, get, language]);
  // Suggestions help while typing; once the signs are shown for this text they would only be in the way.
  const suggestions = useMemo(() => (library && text !== shownText ? suggestSigns(library, text) : []), [library, text, shownText]);
  const examples = useMemo(
    () => (library ? EXAMPLES.filter((example) => planSigns(example, sources)?.missing.length === 0) : []),
    [library, sources],
  );
  const categoryLabel = (category: string) => t(`textToIsl.categories.${categoryKey(category)}`, { defaultValue: category });

  /** Shows the signs for `input` on this screen; returns the plan (null: nothing to sign). */
  const display = (input: string) => {
    const next = planSigns(input, sources);
    setText(input);
    setShownText(input);
    setEmpty(next === null);
    setPlan(next);
    setChosen(next ? next.items.map(() => 0) : []);
    setActiveCard(null);
    setVersion((v) => v + 1);
    return next;
  };

  const show = (input: string) => {
    const next = display(input);
    Keyboard.dismiss();
    if (next) {
      const ids = next.items.flatMap((item) => (item.choices[0] ? [item.choices[0].id] : []));
      history.add({ kind: 'lookup', text: input.trim(), language, signIds: ids });
    }
  };

  // Opened with words (e.g. a recent look-up on the home screen): show them once the signs are loaded.
  // Already in the history, so not added again.
  const { text: linked } = useLocalSearchParams<{ text?: string }>();
  const [shownLink, setShownLink] = useState<string | null>(null);
  if (library && typeof linked === 'string' && linked.trim() && linked !== shownLink) {
    setShownLink(linked);
    display(linked);
  }

  const pick = (input: string) => show(input);

  const shown = plan?.items.filter((item) => item.kind !== 'missing').length ?? 0;

  return (
    <Screen testID="text-to-isl-screen" title={t('screens.textToIsl')} subtitle={t('textToIsl.subtitle')}>
      <Card>
        <TextField
          testID="text-to-isl-input"
          label={t('textToIsl.inputLabel')}
          placeholder={t('textToIsl.placeholder')}
          value={text}
          onChangeText={(value) => {
            setText(value);
            setEmpty(false);
          }}
          maxLength={MAX_QUERY_LENGTH}
          autoCapitalize="sentences"
          autoCorrect
          returnKeyType="go"
          onSubmitEditing={() => show(text)}
        />
        {suggestions.length > 0 ? (
          <View testID="text-to-isl-suggestions" style={[styles.wrap, { gap: spacing.xs }]}>
            {suggestions.map((suggestion) => (
              <PressableScale
                key={suggestion.sign.id}
                accessibilityRole="button"
                accessibilityLabel={t('textToIsl.useSuggestion', { text: suggestion.sign.text })}
                onPress={() => pick(applySuggestion(text, suggestion))}
                style={[styles.chip, { borderRadius: radii.pill, backgroundColor: colors.primaryContainer }]}
              >
                <AppText variant="label" style={{ color: colors.onPrimaryContainer }}>
                  {suggestion.sign.text}
                </AppText>
              </PressableScale>
            ))}
          </View>
        ) : null}
        <Button
          testID="text-to-isl-submit"
          icon="hand-wave-outline"
          label={t('textToIsl.submit')}
          busy={loading}
          onPress={() => show(text)}
        />
        {loading ? (
          <View style={[styles.row, { gap: spacing.sm }]}>
            <ActivityIndicator color={colors.primary} />
            <AppText variant="caption" color="textSecondary">
              {t('textToIsl.loading')}
            </AppText>
          </View>
        ) : null}
        {motion.status === 'empty' ? <Notice tone="warning" testID="text-to-isl-unavailable" message={t('textToIsl.unavailable')} /> : null}
        {empty ? <Notice tone="warning" message={t('textToIsl.empty')} testID="text-to-isl-empty" /> : null}
      </Card>

      {plan ? (
        <FadeIn key={version} style={{ gap: spacing.lg }} testID="text-to-isl-result">
          {shown > 0 ? (
            <SentencePlayer
              testID="sentence-player"
              items={plan.items}
              chosen={chosen}
              suspended={activeCard !== null}
            />
          ) : null}
          {plan.missing.length > 0 ? (
            <Notice
              tone="warning"
              testID="text-to-isl-missing"
              title={t('textToIsl.missingTitle', { count: plan.missing.length })}
              message={t('textToIsl.missingBody', { words: plan.missing.map((w) => `“${w}”`).join(', ') })}
            />
          ) : null}
          {shown > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <View style={{ gap: 2, paddingHorizontal: spacing.xs }}>
                <AppText variant="overline" color="textSecondary" accessibilityRole="header">
                  {t('textToIsl.signsTitle')}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {t('textToIsl.signsBody')}
                </AppText>
              </View>
              <SignCards
                testID="sign-cards"
                items={plan.items}
                chosen={chosen}
                categoryLabel={categoryLabel}
                active={activeCard}
                onToggle={(index) => setActiveCard((current) => (current === index ? null : index))}
                onNextChoice={(index) =>
                  setChosen((previous) => previous.map((c, i) => (i === index ? (c + 1) % plan.items[i]!.choices.length : c)))
                }
              />
            </View>
          ) : null}
          <Notice tone="info" message={t('textToIsl.grammarNotice')} />
        </FadeIn>
      ) : examples.length > 0 ? (
        <Section title={t('textToIsl.examples')}>
          <View style={[styles.wrap, { gap: spacing.xs }]}>
            {examples.map((example) => (
              <PressableScale
                key={example}
                accessibilityRole="button"
                accessibilityLabel={t('textToIsl.tryExample', { text: example })}
                onPress={() => pick(example)}
                style={[styles.chip, { borderRadius: radii.pill, backgroundColor: colors.primaryContainer }]}
              >
                <AppText variant="label" style={{ color: colors.onPrimaryContainer }}>
                  {example}
                </AppText>
              </PressableScale>
            ))}
          </View>
        </Section>
      ) : null}

      {library ? (
        <Section title={t('textToIsl.dictionaryTitle', { count: library.signs.length })}>
          <SignDictionary testID="sign-dictionary" library={library} onPick={pick} categoryLabel={categoryLabel} />
        </Section>
      ) : null}

      {library ? (
        <Card tone="muted" testID="text-to-isl-source">
          <AppText variant="heading">{t('textToIsl.sourceTitle')}</AppText>
          <AppText variant="body" color="textSecondary">
            {t('textToIsl.sourceBody')}
          </AppText>
        </Card>
      ) : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
});
