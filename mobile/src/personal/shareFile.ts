import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Writes `contents` to a file in the app's cache and opens the system share
 * sheet, so the person chooses where it goes (or cancels). Resolves to false
 * when this device cannot share files. Nothing is sent anywhere by the app.
 */
export async function shareJsonFile(name: string, contents: string, dialogTitle: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle });
  return true;
}
