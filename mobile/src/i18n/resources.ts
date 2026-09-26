import bn from '../locales/bn/common.json';
import en from '../locales/en/common.json';
import gu from '../locales/gu/common.json';
import hi from '../locales/hi/common.json';
import kn from '../locales/kn/common.json';
import ml from '../locales/ml/common.json';
import mr from '../locales/mr/common.json';
import pa from '../locales/pa/common.json';
import ta from '../locales/ta/common.json';
import te from '../locales/te/common.json';
import type { LanguageCode } from './languages';

/** Bundled statically so every UI language works offline. */
export const resources: Record<LanguageCode, { common: object }> = {
  en: { common: en },
  hi: { common: hi },
  bn: { common: bn },
  ta: { common: ta },
  te: { common: te },
  mr: { common: mr },
  gu: { common: gu },
  kn: { common: kn },
  ml: { common: ml },
  pa: { common: pa },
};

export type EnglishResources = typeof en;
