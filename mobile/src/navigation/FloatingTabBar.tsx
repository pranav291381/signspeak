import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useReduceMotion } from '@/accessibility/useReduceMotion';
import { Icon, type IconName } from '@/components';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

const NATIVE = Platform.OS !== 'web';
const BAR_HEIGHT = 66;
const INSET = 6;
/** Content scrolling under the bar fades out over this height. */
const FADE = 28;

export const TAB_ICONS: Record<string, [IconName, IconName]> = {
  index: ['home-variant', 'home-variant-outline'],
  'sign-to-text': ['hand-wave', 'hand-wave-outline'],
  'text-to-isl': ['message-text', 'message-text-outline'],
  learn: ['school', 'school-outline'],
  settings: ['cog', 'cog-outline'],
};

/**
 * The app's tab bar: an ink pill floating above the screen, with the brand
 * saffron sliding under the selected tab.
 */
export function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors, elevation, scheme, typography } = useTheme();
  const { settings } = useSettings();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [keyboard, setKeyboard] = useState(false);
  const offset = useState(() => new Animated.Value(0))[0];
  const placed = useRef(false);
  const count = state.routes.length;
  const itemWidth = width > 0 ? (width - 2 * INSET) / count : 0;

  // Android resizes the screen for the keyboard: step aside rather than ride on top of it.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (itemWidth <= 0) return;
    const target = state.index * itemWidth;
    if (!placed.current || reduceMotion) {
      offset.setValue(target);
      placed.current = true;
      return;
    }
    Animated.spring(offset, { toValue: target, speed: 16, bounciness: 7, useNativeDriver: NATIVE }).start();
  }, [state.index, itemWidth, reduceMotion, offset]);

  if (keyboard) return null;

  return (
    <View style={[styles.outer, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 12) }]}>
      {/* Screen content softens into the background just above the bar. */}
      <View pointerEvents="none" style={styles.fade}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="signspeak-tab-fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.background} stopOpacity={0} />
              <Stop offset="1" stopColor={colors.background} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#signspeak-tab-fade)" />
        </Svg>
      </View>
      <View
        accessibilityRole="tablist"
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        style={[
          styles.bar,
          elevation.raised,
          { backgroundColor: colors.tabBar, borderColor: scheme === 'dark' ? colors.border : colors.tabBar },
        ]}
      >
        {itemWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.indicator, { width: itemWidth, backgroundColor: colors.accent, transform: [{ translateX: offset }] }]}
          />
        ) : null}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === index;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);
          const [active, inactive] = TAB_ICONS[route.name] ?? ['circle', 'circle-outline'];
          const color = focused ? colors.onAccent : colors.onTabBar;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              if (settings.hapticsEnabled) Haptics.selectionAsync().catch(() => undefined);
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              testID={options.tabBarButtonTestID}
              accessibilityRole="tab"
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={styles.item}
            >
              <TabIcon name={focused ? active : inactive} color={color} focused={focused} reduceMotion={reduceMotion} />
              <Text
                numberOfLines={1}
                style={[styles.label, { color, fontFamily: typography.label.fontFamily, fontWeight: typography.label.fontWeight }]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The tab's icon; it springs up a little as its tab is chosen. */
function TabIcon({ name, color, focused, reduceMotion }: { name: IconName; color: string; focused: boolean; reduceMotion: boolean }) {
  const scale = useState(() => new Animated.Value(1))[0];
  const wasFocused = useRef(focused);
  useEffect(() => {
    const chosen = focused && !wasFocused.current;
    wasFocused.current = focused;
    if (!chosen || reduceMotion) return;
    scale.setValue(0.78);
    Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 12, useNativeDriver: NATIVE }).start();
  }, [focused, reduceMotion, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Icon name={name} color={color} size={22} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: 16, paddingTop: 6 },
  fade: { position: 'absolute', left: 0, right: 0, top: -FADE, height: FADE },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: 1,
    flexDirection: 'row',
    padding: INSET,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
  },
  indicator: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderRadius: (BAR_HEIGHT - 2 * INSET) / 2,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 27 },
  label: { fontSize: 11, lineHeight: 14, letterSpacing: 0.1 },
});
