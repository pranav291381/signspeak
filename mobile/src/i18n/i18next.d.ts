import 'i18next';

import type { EnglishResources } from './resources';

// Type-check translation keys against the English resource file.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: { common: EnglishResources };
    returnNull: false;
  }
}
