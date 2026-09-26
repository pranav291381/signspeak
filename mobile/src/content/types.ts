import type { LanguageCode } from '@/i18n/languages';

export const SIGN_CATEGORIES = [
  'greetings',
  'everyday',
  'people',
  'food',
  'numbers',
  'places',
  'questions',
  'emergency',
  'phrases',
] as const;

export type SignCategory = (typeof SIGN_CATEGORIES)[number];

/**
 * - `unverified`: a concept we intend to cover; no ISL content has been supplied.
 * - `in_review`: content supplied, awaiting review by qualified ISL educators.
 * - `verified`: reviewed and approved; safe to show as ISL.
 */
export type VerificationStatus = 'unverified' | 'in_review' | 'verified';

export interface Verification {
  status: VerificationStatus;
  /** Qualified ISL educator / Deaf reviewer (name or organisation) once reviewed. */
  reviewedBy?: string;
  /** ISO date of review. */
  reviewedAt?: string;
  /** Where the sign comes from (e.g. a named ISL dictionary or educator). */
  source?: string;
  /** Regional variant this entry documents, if any. */
  region?: string;
  notes?: string;
}

export interface SignMedia {
  kind: 'video' | 'animation';
  /** Bundled asset key or HTTPS URL of a checksummed media pack. */
  uri: string;
  /** Licence under which the media may be used. */
  license: string;
  /** Reference to the signer's recorded consent (never personal data). */
  consentRef: string;
}

export interface SignEntry {
  /** Stable ID. Also the label a recognition model uses for this sign. */
  id: string;
  /**
   * Conventional English gloss for a single sign, or null for multi-sign
   * phrases whose ISL sign order must be supplied by ISL educators.
   */
  gloss: string | null;
  category: SignCategory;
  /** Meaning in each output language (English required). */
  meaning: Partial<Record<LanguageCode, string>> & { en: string };
  /** Text that should find this entry in Text → ISL, per language. */
  phrases: Partial<Record<LanguageCode, string[]>>;
  /** Emergency entries use stricter recognition thresholds. */
  emergency: boolean;
  /** Demonstration; null until verified content exists. */
  media: SignMedia | null;
  verification: Verification;
}

export interface SignLibrary {
  version: string;
  notice: string;
  signs: SignEntry[];
}
