export interface TranscriptEntry {
  text: string;
  /** A fingerspelled letter. */
  letter: boolean;
}

export interface TranscriptWord {
  text: string;
  /** Built from consecutive fingerspelled letters. */
  spelled: boolean;
}

/** Joins consecutive fingerspelled letters into words; signs stay separate. */
export function buildTranscript(entries: readonly TranscriptEntry[]): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  for (const entry of entries) {
    const last = words.at(-1);
    if (entry.letter && last?.spelled) {
      last.text += entry.text;
    } else {
      words.push({ text: entry.text, spelled: entry.letter });
    }
  }
  return words;
}
