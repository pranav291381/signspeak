import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { EXPORT_FILE_PREFIX } from './exportSigns';

/**
 * Writes `contents` to a file in the app's cache and opens the system share
 * sheet, so the person chooses where it goes (or cancels). Resolves to false
 * when this device cannot share files. Nothing is sent anywhere by the app.
 * Earlier export files are removed first, so at most one copy is kept.
 */
export async function shareJsonFile(name: string, contents: string, dialogTitle: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  clearSharedFiles();
  const file = new File(Paths.cache, name);
  file.create();
  file.write(contents);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle });
  return true;
}

/**
 * Removes export files left in the cache. The last one stays until the next
 * export (the app receiving it may still be reading it), or until the person
 * deletes their signs.
 */
export function clearSharedFiles(): void {
  try {
    for (const item of new Directory(Paths.cache).list()) {
      if (item instanceof File && item.name.startsWith(EXPORT_FILE_PREFIX)) item.delete();
    }
  } catch {
    // Nothing to clear, or the cache cannot be listed.
  }
}
