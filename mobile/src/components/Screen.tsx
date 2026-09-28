import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { FadeIn } from './FadeIn';
import { Glow } from './Glow';

interface Props {
  children: ReactNode;
  /** Scroll by default so content survives large system font sizes. */
  scroll?: boolean;
  /** Large in-page title, used by tab screens (which hide the navigation header). */
  title?: string;
  subtitle?: string;
  /** Shown to the right of the large title, e.g. an icon button. */
  headerAction?: ReactNode;
  /** Replaces the title block entirely (e.g. the home screen's brand header). */
  header?: ReactNode;
  /** The saffron glow behind the top of the screen; on by default for tab screens. */
  glow?: boolean;
  edges?: Edge[];
  testID?: string;
}

/** Content never stretches wider than this on tablets and laptops. */
const MAX_CONTENT_WIDTH = 680;
/** Side margin of every screen. */
const SCREEN_GUTTER = 20;

/** Standard screen container: themed background, safe-area padding, consistent gutters. */
export function Screen({
  children,
  scroll = true,
  title,
  subtitle,
  headerAction,
  header: customHeader,
  glow,
  edges,
  testID,
}: Props) {
  const { colors, spacing } = useTheme();
  const tabScreen = Boolean(title || customHeader);
  const safeEdges = edges ?? (tabScreen ? ['top', 'left', 'right'] : ['bottom', 'left', 'right']);
  const padding = {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: tabScreen ? spacing.md : spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  };

  const header =
    customHeader ??
    (title ? (
      <View style={[styles.header, { gap: spacing.md, paddingTop: spacing.sm }]}>
        <View style={styles.flex}>
          <AppText variant="display">{title}</AppText>
          {subtitle ? (
            <AppText variant="body" color="textSecondary">
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {headerAction}
      </View>
    ) : null);

  return (
    <SafeAreaView edges={safeEdges} style={[styles.flex, { backgroundColor: colors.background }]}>
      {(glow ?? tabScreen) ? <Glow /> : null}
      {/* Content eases in when a screen opens (not with "reduce motion"). */}
      <FadeIn style={styles.flex} distance={10} duration={260}>
        {scroll ? (
          <ScrollView
            testID={testID}
            contentContainerStyle={[styles.grow, styles.centered, padding]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {header}
            {children}
          </ScrollView>
        ) : (
          <View testID={testID} style={[styles.flex, styles.centered, padding]}>
            {header}
            {children}
          </View>
        )}
      </FadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  centered: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-end' },
});
