import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText, Card, ListRow, Notice, TextField } from '@/components';
import { getLibrary } from '@/content/library';
import { normalizeText } from '@/content/matcher';
import type { SignEntry } from '@/content/types';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { MAX_CUSTOM_TEXT, signIdFor } from '@/personal/store';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

const MAX_SUGGESTIONS = 8;

function matches(sign: SignEntry, query: string): boolean {
  const texts = [...Object.values(sign.meaning), ...Object.values(sign.phrases).flat()] as string[];
  return texts.some((text) => normalizeText(text).includes(query));
}

/** Pick what to teach: a common word from the library, any word or phrase, or the alphabet. */
export function TeachChooser() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { settings } = useSettings();
  const { get } = usePersonalSigns();
  const [text, setText] = useState('');
  const query = normalizeText(text);
  const language = settings.appLanguage;

  const library = getLibrary().signs;
  const suggestions = (query ? library.filter((s) => matches(s, query)) : library).slice(0, query ? MAX_SUGGESTIONS : 12);
  const exact = library.some((s) => normalizeText(s.meaning[language] ?? s.meaning.en) === query);

  const takesLabel = (id: string) => {
    const count = get(id)?.samples.length ?? 0;
    return count > 0 ? t('teach.chooser.takes', { count }) : undefined;
  };

  return (
    <View style={{ gap: spacing.lg }} testID="teach-chooser">
      <AppText variant="body" color="textSecondary">
        {t('teach.chooser.intro')}
      </AppText>
      <TextField
        testID="teach-search"
        label={t('teach.chooser.label')}
        placeholder={t('teach.chooser.placeholder')}
        value={text}
        onChangeText={setText}
        maxLength={MAX_CUSTOM_TEXT}
        autoCorrect={false}
      />

      {query && !exact ? (
        <Card padded={false} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
          <ListRow
            testID="teach-custom"
            icon="plus-circle-outline"
            label={t('teach.chooser.custom', { text: text.trim() })}
            value={takesLabel(signIdFor({ kind: 'custom', text, language }))}
            onPress={() => router.replace({ pathname: '/signs/teach', params: { kind: 'custom', text: text.trim() } })}
          />
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <AppText variant="overline" color="textSecondary">
          {query ? t('teach.chooser.matches') : t('teach.chooser.common')}
        </AppText>
        {suggestions.length > 0 ? (
          <Card padded={false} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: 0 }}>
            {suggestions.map((sign) => (
              <ListRow
                key={sign.id}
                testID={`teach-library-${sign.id}`}
                label={sign.meaning[language] ?? sign.meaning.en}
                value={takesLabel(signIdFor({ kind: 'library', signId: sign.id }))}
                onPress={() => router.replace({ pathname: '/signs/teach', params: { kind: 'library', id: sign.id } })}
              />
            ))}
          </Card>
        ) : (
          <AppText variant="caption" color="textSecondary">
            {t('teach.chooser.noMatches')}
          </AppText>
        )}
      </View>

      <Card padded={false} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
        <ListRow
          testID="teach-alphabet"
          icon="alphabetical-variant"
          label={t('teach.chooser.alphabet')}
          description={t('teach.chooser.alphabetHint')}
          onPress={() => router.replace({ pathname: '/signs/teach', params: { kind: 'alphabet' } })}
        />
      </Card>

      <Notice tone="info" icon="account-check-outline" message={t('teach.chooser.whoShouldRecord')} />
    </View>
  );
}
