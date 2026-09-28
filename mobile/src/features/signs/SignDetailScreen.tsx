import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, confirmAction, IconButton, Notice, PressableScale, Screen, StateView } from '@/components';
import { SignDiagram } from '@/diagram/SignDiagram';
import { signText } from '@/personal/labels';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { sampleFrames } from '@/personal/store';
import { MIN_SAMPLES_FOR_RECOGNITION, type PersonalSign } from '@/personal/types';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

/** One taught sign: its takes as animated diagrams, and ways to add or remove them. */
export function SignDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, get } = usePersonalSigns();
  const sign = id ? get(id) : undefined;

  if (!ready) {
    return (
      <Screen>
        <StateView loading title={t('common.loading')} />
      </Screen>
    );
  }
  if (!sign) {
    return (
      <Screen testID="sign-detail-screen">
        <StateView
          testID="sign-not-found"
          icon="hand-back-right-off-outline"
          title={t('signs.notFound')}
          action={{ label: t('signs.back'), icon: 'arrow-left', onPress: () => router.back() }}
        />
      </Screen>
    );
  }
  return <SignDetail sign={sign} />;
}

function SignDetail({ sign }: { sign: PersonalSign }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();
  const { settings } = useSettings();
  const { remove, removeSample } = usePersonalSigns();
  const [selected, setSelected] = useState(0);
  const take = Math.min(selected, sign.samples.length - 1);
  const name = signText(sign, settings.outputLanguage);
  const letter = sign.target.kind === 'letter';
  const ready = sign.samples.length >= MIN_SAMPLES_FOR_RECOGNITION;
  const frames = useMemo(() => {
    try {
      return sampleFrames(sign.samples[take]!);
    } catch {
      return null;
    }
  }, [sign, take]);

  const teachAgain = () => {
    const target = sign.target;
    const params =
      target.kind === 'library'
        ? { kind: 'library', id: target.signId }
        : target.kind === 'letter'
          ? { kind: 'letter', letter: target.letter }
          : { kind: 'custom', text: target.text };
    router.push({ pathname: '/signs/teach', params });
  };

  return (
    <Screen testID="sign-detail-screen">
      <Stack.Screen options={{ title: name }} />
      <View style={[styles.stage, { backgroundColor: colors.surfaceAlt, borderRadius: radii.xl }]}>
        {frames ? (
          <SignDiagram
            key={take}
            testID="sign-diagram"
            frames={frames}
            focus={letter ? 'hands' : 'body'}
            accessibilityLabel={t('diagram.a11y', { text: name })}
          />
        ) : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="overline" color="textSecondary">
          {t('signs.takes', { count: sign.samples.length })}
        </AppText>
        <View style={[styles.takes, { gap: spacing.sm }]}>
          {sign.samples.map((sample, i) => (
            <View key={`${sample.recordedAt}-${i}`} style={[styles.take, { gap: 2 }]}>
              <PressableScale
                testID={`take-${i}`}
                accessibilityRole="button"
                accessibilityLabel={t('signs.showTake', { number: i + 1 })}
                accessibilityState={{ selected: i === take }}
                onPress={() => setSelected(i)}
                style={[
                  styles.takeChip,
                  {
                    borderRadius: radii.pill,
                    backgroundColor: i === take ? colors.primary : colors.surfaceAlt,
                  },
                ]}
              >
                <AppText variant="label" style={{ color: i === take ? colors.onPrimary : colors.text }}>
                  {t('signs.take', { number: i + 1 })}
                </AppText>
              </PressableScale>
              <IconButton
                testID={`delete-take-${i}`}
                variant="plain"
                icon="trash-can-outline"
                accessibilityLabel={t('signs.deleteTake', { number: i + 1 })}
                onPress={() =>
                  confirmAction({
                    title: t('signs.deleteTakeTitle'),
                    message: t('signs.deleteTakeMessage'),
                    confirmLabel: t('signs.delete'),
                    cancelLabel: t('common.cancel'),
                    onConfirm: () => {
                      setSelected(0);
                      void removeSample(sign.id, i);
                    },
                  })
                }
              />
            </View>
          ))}
        </View>
      </View>

      <Notice
        tone={ready ? 'success' : 'warning'}
        message={
          ready
            ? t('signs.readyMessage')
            : t('signs.needsMoreMessage', { count: MIN_SAMPLES_FOR_RECOGNITION - sign.samples.length })
        }
      />

      <Card>
        <Button testID="sign-teach-again" icon="record-circle-outline" label={t('signs.addTake')} onPress={teachAgain} />
        <Button
          testID="sign-delete"
          variant="outline"
          icon="delete-outline"
          label={t('signs.deleteSign')}
          onPress={() =>
            confirmAction({
              title: t('signs.deleteSignTitle', { name }),
              message: t('signs.deleteSignMessage'),
              confirmLabel: t('signs.delete'),
              cancelLabel: t('common.cancel'),
              onConfirm: () => {
                void remove(sign.id).then(() => router.back());
              },
            })
          }
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', aspectRatio: 1, overflow: 'hidden' },
  takes: { flexDirection: 'row', flexWrap: 'wrap' },
  take: { flexDirection: 'row', alignItems: 'center' },
  takeChip: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
});
