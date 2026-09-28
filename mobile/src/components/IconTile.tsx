import { View } from 'react-native';

import { tileColors, useTheme, type TileColor } from '@/theme';

import { Icon, type IconName } from './Icon';

interface Props {
  icon: IconName;
  /** A coloured tile with a white icon; without it, a quiet tinted tile. */
  tile?: TileColor;
  /** Icon colour on the quiet tile (default: primary). */
  color?: string;
  size?: number;
}

/** Rounded square behind a row's icon. Decorative: the row's text names it. */
export function IconTile({ icon, tile, color, size = 36 }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tile ? tileColors[tile] : colors.surfaceAlt,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.55)} color={tile ? '#FFFFFF' : (color ?? colors.primary)} />
    </View>
  );
}
