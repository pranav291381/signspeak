import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText, FadeIn, Icon, IconTile, Notice, PressableScale, Screen, type IconName } from '@/components';
import { useHistory } from '@/history/HistoryProvider';
import type { HistoryEntry } from '@/history/history';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { ALPHABET } from '@/personal/types';
import { useTheme } from '@/theme';

const LOGO = require('../../../assets/logo.png');
const RECENT = 3;

function greetingKey(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { entries } = useHistory();
  const recent = entries.slice(0, RECENT);

  return (
    <Screen testID="home-screen" header={<HomeHeader />}>
      <FadeIn delay={40} distance={14}>
        <SignHero onPress={() => router.navigate('/sign-to-text')} />
      </FadeIn>
      <FadeIn delay={110} distance={14} style={[styles.row, { gap: spacing.md }]}>
        <Tile
          testID="home-text-to-isl"
          tone="ink"
          icon="message-text-outline"
          title={t('home.textToIsl.title')}
          accessibilityLabel={t('home.textToIsl.a11yLabel')}
          description={t('home.textToIsl.description')}
          onPress={() => router.navigate('/text-to-isl')}
        />
        <Tile
          testID="home-history"
          tone="paper"
          icon="history"
          title={t('home.history.title')}
          description={t('home.history.description')}
          onPress={() => router.push('/history')}
        />
      </FadeIn>
      <FadeIn delay={150} distance={14}>
        <YourSigns onPress={() => router.push('/signs')} />
      </FadeIn>
      {recent.length > 0 ? (
        <FadeIn delay={180} distance={14}>
          <Recent
            entries={recent}
            onOpen={(entry) =>
              entry.kind === 'lookup'
                ? router.navigate({ pathname: '/text-to-isl', params: { text: entry.text } })
                : router.push('/history')
            }
          />
        </FadeIn>
      ) : null}
      <FadeIn delay={240} distance={14}>
        <Notice tone="info" message={t('home.disclaimer')} />
      </FadeIn>
    </Screen>
  );
}

/** The logo and name, a greeting, and what the app is for. */
function HomeHeader() {
  const { t } = useTranslation();
  const { radii, spacing } = useTheme();
  const greeting = t(`home.greeting.${greetingKey(new Date().getHours())}`);
  return (
    <View style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
      <View style={[styles.row, styles.center, { gap: spacing.sm }]}>
        {/* Decorative: the name next to it is read out. */}
        <Image source={LOGO} style={[styles.logo, { borderRadius: radii.md - 2 }]} accessible={false} accessibilityIgnoresInvertColors />
        <AppText variant="heading" accessibilityRole="header" style={styles.wordmark}>
          {t('home.title')}
        </AppText>
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="overline" color="textSecondary">
          {greeting}
        </AppText>
        <AppText variant="display" accessibilityRole="text">
          {t('home.intro')}
        </AppText>
      </View>
    </View>
  );
}

/** Sound-wave arcs from the logo, drawn large in the corner of the hero card. */
function Waves({ color }: { color: string }) {
  return (
    <Svg width={220} height={220} viewBox="0 0 220 220" style={styles.waves} pointerEvents="none">
      {[56, 96, 136].map((r, i) => (
        <Path
          key={r}
          d={`M ${70 + r * Math.cos(-1.35)} ${150 + r * Math.sin(-1.35)} A ${r} ${r} 0 0 1 ${70 + r * Math.cos(-0.2)} ${150 + r * Math.sin(-0.2)}`}
          stroke={color}
          strokeOpacity={0.2 - i * 0.04}
          strokeWidth={16}
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

/** Sign → Text, the heart of the app: a saffron card that opens the camera. */
function SignHero({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const ink = colors.onAccent;
  return (
    <PressableScale
      testID="home-sign-to-text"
      accessibilityRole="button"
      accessibilityLabel={`${t('home.signToText.a11yLabel')}. ${t('home.signToText.description')}`}
      onPress={onPress}
      pressedScale={0.975}
      pressedOpacity={0.95}
      style={[styles.hero, { backgroundColor: colors.accent, borderRadius: radii.xl, padding: spacing.xl - 2, gap: spacing.md }]}
    >
      <Waves color={ink} />
      <View style={[styles.badge, { backgroundColor: 'rgba(31, 35, 44, 0.1)', borderRadius: radii.pill }]}>
        <Icon name="shield-lock-outline" size={14} color={ink} />
        <AppText variant="label" style={[styles.badgeText, { color: ink }]}>
          {t('home.signToText.badge')}
        </AppText>
      </View>
      <View style={{ gap: spacing.xs, paddingRight: spacing.xxl }}>
        <AppText variant="display" accessibilityRole="none" style={{ color: ink, fontSize: 30, lineHeight: 36 }}>
          {t('home.signToText.title')}
        </AppText>
        <AppText variant="body" style={{ color: ink, opacity: 0.86 }}>
          {t('home.signToText.description')}
        </AppText>
      </View>
      <View style={[styles.cta, { backgroundColor: ink, borderRadius: radii.pill }]}>
        <Icon name="camera-outline" size={18} color={colors.accent} />
        <AppText variant="label" style={{ color: colors.accent }}>
          {t('home.signToText.cta')}
        </AppText>
        <Icon name="arrow-right" size={18} color={colors.accent} />
      </View>
    </PressableScale>
  );
}

interface TileProps {
  title: string;
  description: string;
  icon: IconName;
  tone: 'ink' | 'paper';
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

/** Half-width card for the other places the app can take you. */
function Tile({ title, description, icon, tone, onPress, accessibilityLabel, testID }: TileProps) {
  const { colors, elevation, radii, scheme, spacing } = useTheme();
  const ink = tone === 'ink';
  const fg = ink ? (scheme === 'dark' ? colors.text : colors.onPrimary) : colors.text;
  const fgSecondary = ink ? colors.onTabBar : colors.textSecondary;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel ?? title}. ${description}`}
      onPress={onPress}
      pressedScale={0.96}
      pressedOpacity={0.94}
      style={[
        styles.tile,
        ink ? null : elevation.card,
        {
          backgroundColor: ink ? colors.tabBar : colors.surface,
          borderColor: ink ? (scheme === 'dark' ? colors.border : colors.tabBar) : colors.border,
          borderRadius: radii.lg + 2,
          padding: spacing.lg,
          gap: spacing.md,
        },
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: ink ? colors.accent : colors.primaryContainer }]}>
        <Icon name={icon} size={22} color={ink ? colors.onAccent : colors.onPrimaryContainer} />
      </View>
      <View style={[styles.flex, { gap: 2 }]}>
        <AppText variant="heading" accessibilityRole="none" style={{ color: fg }}>
          {title}
        </AppText>
        <AppText variant="caption" style={{ color: fgSecondary }}>
          {description}
        </AppText>
      </View>
      <View style={styles.tileArrow}>
        <Icon name="arrow-top-right" size={20} color={ink ? colors.accent : colors.textSecondary} />
      </View>
    </PressableScale>
  );
}

/** Signs taught on this phone: teaching the app the way you sign makes it recognize you better. */
function YourSigns({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, elevation, radii, spacing } = useTheme();
  const { signs, recognizable } = usePersonalSigns();
  const letters = signs.filter((s) => s.target.kind === 'letter').length;
  const description =
    signs.length > 0
      ? t('home.signs.summary', { words: signs.length - letters, letters, total: ALPHABET.length, ready: recognizable.length })
      : t('home.signs.empty');
  return (
    <PressableScale
      testID="home-signs"
      accessibilityRole="button"
      accessibilityLabel={`${t('home.signs.title')}. ${description}`}
      onPress={onPress}
      pressedScale={0.985}
      style={[
        elevation.card,
        styles.row,
        styles.center,
        styles.signsRow,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, gap: spacing.md },
      ]}
    >
      <IconTile icon="school-outline" tile="saffron" size={40} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" accessibilityRole="none">
          {t('home.signs.title')}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {description}
        </AppText>
      </View>
      <Icon name="chevron-right" size={20} color={colors.textSecondary} />
    </PressableScale>
  );
}

/** The last few things signed or looked up, one tap from seeing them again. */
function Recent({ entries, onOpen }: { entries: HistoryEntry[]; onOpen: (entry: HistoryEntry) => void }) {
  const { t, i18n } = useTranslation();
  const { colors, elevation, radii, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }} testID="home-recent">
      <AppText variant="overline" color="textSecondary" accessibilityRole="header" style={{ paddingHorizontal: spacing.xs }}>
        {t('home.recent')}
      </AppText>
      <View
        style={[
          elevation.card,
          { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
        ]}
      >
        {entries.map((entry, i) => {
          const kind = t(`history.kinds.${entry.kind}`);
          const when = new Date(entry.createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
          return (
            <View key={entry.id}>
              {i > 0 ? <View style={[styles.hairline, { backgroundColor: colors.border }]} /> : null}
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={t('history.entryA11y', { kind, text: entry.text, when })}
                onPress={() => onOpen(entry)}
                pressedScale={0.985}
                style={[styles.row, styles.center, styles.recentRow, { gap: spacing.md }]}
              >
                <IconTile
                  icon={entry.kind === 'recognition' ? 'hand-wave-outline' : 'message-text-outline'}
                  tile={entry.kind === 'recognition' ? 'saffron' : 'ink'}
                  size={34}
                />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {entry.text}
                  </AppText>
                  <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                    {t('history.entryMeta', { kind, when })}
                  </AppText>
                </View>
                <Icon name="chevron-right" size={20} color={colors.textSecondary} />
              </PressableScale>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  center: { alignItems: 'center' },
  flex: { flex: 1 },
  logo: { width: 36, height: 36 },
  wordmark: { fontSize: 20, letterSpacing: -0.4 },
  hero: { overflow: 'hidden', minHeight: 220 },
  waves: { position: 'absolute', right: -40, top: -36 },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12, lineHeight: 16 },
  cta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, paddingHorizontal: 18, minHeight: 46, marginTop: 4 },
  tile: { flex: 1, borderWidth: 1, minHeight: 190 },
  tileIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileArrow: { position: 'absolute', top: 16, right: 16 },
  hairline: { height: StyleSheet.hairlineWidth * 2, marginLeft: 46 },
  recentRow: { minHeight: 60, paddingVertical: 8 },
  signsRow: { borderWidth: 1, minHeight: 64 },
});
