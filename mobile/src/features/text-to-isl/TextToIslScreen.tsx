import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Notice, PressableScale, Screen, TextField } from '@/components';
import { MAX_QUERY_LENGTH } from '@/content/matcher';
import { SignSequencePlayer } from '@/diagram/SignSequencePlayer';
import { useHistory } from '@/history/HistoryProvider';
import { signText } from '@/personal/labels';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import type { SignTarget } from '@/personal/types';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

import { planSigns, type PlannedItem, type SignPlan } from './plan';

const MAX_EXAMPLES = 6;

function teachParams(target: SignTarget): Record<string, string> {
  switch (target.kind) {
    case 'library':
      return { kind: 'library', id: target.signId };
    case 'letter':
      return { kind: 'letter', letter: target.letter };
    case 'custom':
      return { kind: 'custom', text: target.text };
  }
}

/** Text → ISL: typed words become a sequence of hand-skeleton sign diagrams. */
export function TextToIslScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();
  const { settings } = useSettings();
  const { signs, get } = usePersonalSigns();
  const history = useHistory();
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<SignPlan | null>(null);
  const [empty, setEmpty] = useState(false);
  const [version, setVersion] = useState(0);
  const language = settings.appLanguage;
  const letters = signs.filter((s) => s.target.kind === 'letter').length;
  const examples = signs
    .filter((s) => s.target.kind !== 'letter')
    .slice(0, MAX_EXAMPLES)
    .map((s) => signText(s, language));

  const show = (input: string) => {
    const next = planSigns(input, signs, get, language);
    setEmpty(next === null);
    setPlan(next);
    setVersion((v) => v + 1);
    if (next) history.add({ kind: 'lookup', text: input.trim(), language, signIds: [] });
  };

  const recordMissing = (item: PlannedItem) => {
    if (item.target) router.push({ pathname: '/signs/teach', params: teachParams(item.target) });
    else router.push({ pathname: '/signs/teach', params: { kind: 'custom', text: item.caption } });
  };

  return (
    <Screen testID="text-to-isl-screen" title={t('screens.textToIsl')} subtitle={t('textToIsl.subtitle')}>
      <Card>
        <TextField
          testID="text-to-isl-input"
          label={t('textToIsl.inputLabel')}
          placeholder={t('textToIsl.placeholder')}
          value={text}
          onChangeText={setText}
          maxLength={MAX_QUERY_LENGTH}
          returnKeyType="go"
          onSubmitEditing={() => show(text)}
        />
        <Button testID="text-to-isl-submit" icon="hand-wave-outline" label={t('textToIsl.submit')} onPress={() => show(text)} />
        {empty ? <Notice tone="warning" message={t('textToIsl.empty')} testID="text-to-isl-empty" /> : null}
      </Card>

      {plan ? (
        <View style={{ gap: spacing.md }} testID="text-to-isl-result">
          <SignSequencePlayer key={version} items={plan.items} onRecordMissing={recordMissing} testID="sign-sequence" />
          {plan.missing > 0 ? (
            <Notice
              tone="warning"
              testID="text-to-isl-missing"
              message={t('textToIsl.missing', { count: plan.missing })}
            />
          ) : null}
          <Notice tone="info" message={t('textToIsl.grammarNotice')} />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {examples.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="overline" color="textSecondary">
                {t('textToIsl.examples')}
              </AppText>
              <View style={[styles.chips, { gap: spacing.xs }]}>
                {examples.map((example) => (
                  <PressableScale
                    key={example}
                    accessibilityRole="button"
                    accessibilityLabel={t('textToIsl.tryExample', { text: example })}
                    onPress={() => {
                      setText(example);
                      show(example);
                    }}
                    style={[styles.chip, { borderRadius: radii.pill, backgroundColor: colors.primaryContainer }]}
                  >
                    <AppText variant="label" style={{ color: colors.onPrimaryContainer }}>
                      {example}
                    </AppText>
                  </PressableScale>
                ))}
              </View>
            </View>
          ) : null}
          <Card tone="muted" testID="text-to-isl-how">
            <AppText variant="heading">{t('textToIsl.howTitle')}</AppText>
            <AppText variant="body" color="textSecondary">
              {t('textToIsl.howBody')}
            </AppText>
            {letters < 26 ? (
              <Button
                testID="text-to-isl-record-alphabet"
                variant="secondary"
                icon="alphabetical-variant"
                label={t('textToIsl.recordAlphabet')}
                onPress={() => router.push({ pathname: '/signs/teach', params: { kind: 'alphabet' } })}
              />
            ) : null}
            <Button
              variant="ghost"
              icon="plus"
              label={t('home.signs.teach')}
              onPress={() => router.push('/signs/teach')}
            />
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
});
