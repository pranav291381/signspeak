import { useRouter } from 'expo-router';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, confirmAction, Icon, ListRow, Notice, Pill, Screen, StateView } from '@/components';
import { SignDiagram } from '@/diagram/SignDiagram';
import { signText } from '@/personal/labels';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { sampleFrames } from '@/personal/store';
import { ALPHABET, MIN_SAMPLES_FOR_RECOGNITION, type PersonalSign } from '@/personal/types';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

/** Signs taught on this phone. */
export function MySignsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { ready, signs, removeAll } = usePersonalSigns();
  const words = signs.filter((s) => s.target.kind !== 'letter');
  const letters = signs.length - words.length;

  if (!ready) {
    return (
      <Screen>
        <StateView loading title={t('common.loading')} />
      </Screen>
    );
  }

  return (
    <Screen testID="my-signs-screen">
      <AppText variant="body" color="textSecondary">
        {t('signs.intro')}
      </AppText>
      <Button testID="my-signs-teach" icon="plus" label={t('home.signs.teach')} onPress={() => router.push('/signs/teach')} />

      {words.length === 0 ? (
        <StateView compact icon="hand-back-right-outline" title={t('signs.emptyTitle')} message={t('signs.emptyMessage')} />
      ) : (
        <Card padded={false} style={{ gap: 0 }} testID="my-signs-list">
          {words.map((sign, i) => (
            <SignRow key={sign.id} sign={sign} first={i === 0} onPress={() => router.push({ pathname: '/signs/[id]', params: { id: sign.id } })} />
          ))}
        </Card>
      )}

      <Card padded={false} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
        <ListRow
          icon="alphabetical-variant"
          label={t('learn.alphabet.title')}
          value={t('learn.alphabet.progress', { count: letters, total: ALPHABET.length })}
          onPress={() => router.navigate('/learn')}
        />
      </Card>

      <Notice tone="info" icon="shield-lock-outline" message={t('signs.privacy')} />

      {signs.length > 0 ? (
        <Button
          testID="delete-all-signs"
          variant="outline"
          icon="delete-outline"
          label={t('signs.deleteAll')}
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
      ) : null}
    </Screen>
  );
}

const SignRow = memo(function SignRow({ sign, first, onPress }: { sign: PersonalSign; first: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { settings } = useSettings();
  const name = signText(sign, settings.outputLanguage);
  const takes = sign.samples.length;
  const ready = takes >= MIN_SAMPLES_FOR_RECOGNITION;
  const frames = useMemo(() => {
    try {
      return sign.samples[0] ? sampleFrames(sign.samples[0]) : null;
    } catch {
      return null;
    }
  }, [sign]);

  return (
    <Pressable
      testID={`sign-row-${sign.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${t('signs.takes', { count: takes })}. ${ready ? t('signs.ready') : t('signs.needsMore', { count: MIN_SAMPLES_FOR_RECOGNITION - takes })}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          padding: spacing.md,
          gap: spacing.md,
          borderTopWidth: first ? 0 : 1,
          borderTopColor: colors.border,
          backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
        },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt, borderRadius: radii.md }]}>
        {frames ? <SignDiagram frames={frames} playing={false} accessibilityLabel="" /> : null}
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{name}</AppText>
        <AppText variant="caption" color="textSecondary">
          {t('signs.takes', { count: takes })}
        </AppText>
      </View>
      <Pill
        tone={ready ? 'success' : 'warning'}
        label={ready ? t('signs.ready') : t('signs.needsMore', { count: MIN_SAMPLES_FOR_RECOGNITION - takes })}
      />
      <Icon name="chevron-right" size={22} color={colors.textSecondary} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 56, height: 56, overflow: 'hidden' },
  flex: { flex: 1 },
});
