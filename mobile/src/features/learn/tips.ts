import type { IconName } from '@/components';

/**
 * General guidance for communicating with Deaf people and sign language users.
 * It describes good practice, not how any ISL sign is made. Text lives in the
 * locale files under `learn.tips.<id>`; review status is shown in the app.
 */
export const TIPS: { id: string; icon: IconName }[] = [
  { id: 'attention', icon: 'hand-wave-outline' },
  { id: 'face', icon: 'eye-outline' },
  { id: 'light', icon: 'lightbulb-on-outline' },
  { id: 'expression', icon: 'emoticon-outline' },
  { id: 'fingerspell', icon: 'alphabetical-variant' },
  { id: 'language', icon: 'translate' },
  { id: 'regional', icon: 'map-marker-radius-outline' },
  { id: 'check', icon: 'check-circle-outline' },
  { id: 'space', icon: 'crop-free' },
  { id: 'interpreter', icon: 'account-voice' },
  { id: 'community', icon: 'account-group-outline' },
];
