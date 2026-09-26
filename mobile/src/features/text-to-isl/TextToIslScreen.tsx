import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';

import { AppText, Button, Notice, Screen, StateView } from '@/components';
import { lookupPhrase, MAX_QUERY_LENGTH, type LookupResult } from '@/content/matcher';
import { SignCard } from '@/content/SignCard';
import { useHistory } from '@/history/HistoryProvider';
import { useSettings } from '@/settings/SettingsProvider';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

export function TextToIslScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, radii, spacing, typography } = useTheme();
  const { settings } = useSettings();
  const history = useHistory();
  const [text, setText] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);

  const language = settings.appLanguage;
  const openLesson = (id: string) => router.push({ pathname: '/learn/sign/[id]', params: { id } });

  const submit = () => {
    const next = lookupPhrase(text);
    setResult(next);
    if (next.status === 'match') {
      history.add({ kind: 'lookup', text: text.trim(), language, signIds: next.signs.map((s) => s.id) });
    }
  };

  return (
    <Screen testID="text-to-isl-screen">
      <Notice tone="info" message={t('textToIsl.scopeNotice')} />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="bodyStrong" nativeID="text-to-isl-label">
          {t('textToIsl.inputLabel')}
        </AppText>
        <TextInput
          testID="text-to-isl-input"
          accessibilityLabel={t('textToIsl.inputLabel')}
          accessibilityLabelledBy="text-to-isl-label"
          value={text}
          onChangeText={setText}
          placeholder={t('textToIsl.placeholder')}
          placeholderTextColor={colors.textSecondary}
          maxLength={MAX_QUERY_LENGTH}
          returnKeyType="search"
          onSubmitEditing={submit}
          style={[
            typography.body,
            {
              minHeight: MIN_TOUCH_TARGET,
              borderWidth: 2,
              borderColor: colors.outline,
              borderRadius: radii.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              color: colors.text,
              backgroundColor: colors.surface,
            },
          ]}
        />
        <Button testID="text-to-isl-submit" icon="hand-back-left-outline" label={t('textToIsl.submit')} onPress={submit} />
      </View>

      {result?.status === 'empty' ? <Notice tone="warning" message={t('textToIsl.empty')} testID="text-to-isl-empty" /> : null}

      {result?.status === 'match' ? (
        <View style={{ gap: spacing.md }} testID="text-to-isl-match">
          {result.signs.length > 1 ? <Notice tone="info" message={t('textToIsl.ambiguous')} /> : null}
          {result.signs.map((sign) => (
            <SignCard key={sign.id} sign={sign} language={language} onOpenLesson={() => openLesson(sign.id)} />
          ))}
        </View>
      ) : null}

      {result?.status === 'no_match' ? (
        <View style={{ gap: spacing.md }} testID="text-to-isl-no-match">
          <StateView icon="book-search-outline" title={t('textToIsl.noMatchTitle')} message={t('textToIsl.noMatchMessage')} />
          {result.related.length > 0 ? (
            <>
              <Notice tone="warning" title={t('textToIsl.relatedTitle')} message={t('textToIsl.relatedWarning')} />
              {result.related.map((sign) => (
                <SignCard key={sign.id} sign={sign} language={language} compact onOpenLesson={() => openLesson(sign.id)} />
              ))}
            </>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
