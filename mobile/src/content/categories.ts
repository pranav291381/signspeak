import type { IconName } from '@/components';
import { SIGN_CATEGORIES, type SignCategory } from '@/content/types';

export const CATEGORY_ICONS: Record<SignCategory, IconName> = {
  greetings: 'hand-wave-outline',
  everyday: 'white-balance-sunny',
  people: 'account-group-outline',
  food: 'food-apple-outline',
  numbers: 'numeric',
  places: 'map-marker-outline',
  questions: 'help-circle-outline',
  emergency: 'alert-octagon-outline',
  phrases: 'message-text-outline',
};

export function isCategory(value: unknown): value is SignCategory {
  return typeof value === 'string' && (SIGN_CATEGORIES as readonly string[]).includes(value);
}
