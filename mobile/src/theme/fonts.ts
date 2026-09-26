/* Only the four weights the app uses are bundled (each file is ~340 KB). */
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';

import { FONT_FAMILIES } from './tokens';

export const APP_FONTS = {
  [FONT_FAMILIES['400']]: Inter_400Regular,
  [FONT_FAMILIES['500']]: Inter_500Medium,
  [FONT_FAMILIES['600']]: Inter_600SemiBold,
  [FONT_FAMILIES['700']]: Inter_700Bold,
};
