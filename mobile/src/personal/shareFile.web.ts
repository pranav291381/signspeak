/** Web: the browser downloads the file; nothing is sent anywhere. */
export async function shareJsonFile(name: string, contents: string, _dialogTitle: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Give the download a moment to start before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return true;
}
