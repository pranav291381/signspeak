/**
 * Feedback reports for pilots. Mirrors backend/signspeak_api/schemas.py (FeedbackIn).
 * Deliberately minimal: no name, contact details, images, video or device IDs.
 */

import type { LanguageCode } from '@/i18n/languages';

export const FEEDBACK_FEATURES = ['sign_to_text', 'text_to_isl', 'learn', 'history', 'settings', 'other'] as const;
export const ISSUE_TYPES = [
  'wrong_recognition',
  'not_recognized',
  'accessibility',
  'content',
  'language',
  'crash',
  'performance',
  'privacy',
  'feature_request',
  'other',
] as const;

export type FeedbackFeature = (typeof FEEDBACK_FEATURES)[number];
export type IssueType = (typeof ISSUE_TYPES)[number];

export const MAX_DESCRIPTION = 2000;
export const MAX_EXPECTED = 500;

export interface FeedbackReport {
  feature: FeedbackFeature;
  issue_type: IssueType;
  description: string;
  expected_result: string | null;
  model_prediction: { label: string | null; band: 'high' | 'medium' | null; model_id: string | null; simulated: boolean } | null;
  environment: {
    app_version: string;
    platform: 'android' | 'ios' | 'web' | 'other';
    os_version: string | null;
    app_language: LanguageCode;
    output_language: LanguageCode;
  };
  metadata: Record<string, string | number | boolean>;
}

export type FeedbackProblem = 'description_required' | 'description_too_long' | 'expected_too_long';

export function validateFeedback(report: FeedbackReport): FeedbackProblem[] {
  const problems: FeedbackProblem[] = [];
  if (!report.description.trim()) problems.push('description_required');
  if (report.description.length > MAX_DESCRIPTION) problems.push('description_too_long');
  if ((report.expected_result?.length ?? 0) > MAX_EXPECTED) problems.push('expected_too_long');
  return problems;
}

export function isFeature(value: unknown): value is FeedbackFeature {
  return typeof value === 'string' && (FEEDBACK_FEATURES as readonly string[]).includes(value);
}

export function isIssueType(value: unknown): value is IssueType {
  return typeof value === 'string' && (ISSUE_TYPES as readonly string[]).includes(value);
}

/** Plain-text version for the share sheet (email, WhatsApp, etc. chosen by the user). */
export function formatForSharing(report: FeedbackReport): string {
  return ['SignSpeak feedback', JSON.stringify(report, null, 2)].join('\n\n');
}

export type SubmitResult =
  | { status: 'sent'; reportId: string }
  /** Could not reach the server (offline, DNS, timeout). Nothing was sent. */
  | { status: 'offline' }
  /** Server refused the report (validation). */
  | { status: 'rejected' }
  | { status: 'error' };

export async function submitFeedback(
  baseUrl: string,
  report: FeedbackReport,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15000,
): Promise<SubmitResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/v1/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report),
      signal: controller.signal,
    });
    if (response.status === 201) {
      const body = (await response.json()) as { report_id?: unknown };
      return typeof body.report_id === 'string' ? { status: 'sent', reportId: body.report_id } : { status: 'error' };
    }
    if (response.status === 422 || response.status === 413) return { status: 'rejected' };
    return { status: 'error' };
  } catch {
    return { status: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** Optional project server, configured at build time. Empty means "share only". */
export function feedbackServerUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  return url ? url : null;
}
