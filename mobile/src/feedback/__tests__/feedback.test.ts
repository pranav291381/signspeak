import { formatForSharing, submitFeedback, validateFeedback, type FeedbackReport } from '../feedback';

const report: FeedbackReport = {
  feature: 'sign_to_text',
  issue_type: 'wrong_recognition',
  description: 'Showed water instead of thank you',
  expected_result: 'Thank you',
  model_prediction: { label: 'water', band: null, model_id: null, simulated: false },
  environment: { app_version: '0.1.0', platform: 'android', os_version: '34', app_language: 'hi', output_language: 'en' },
  metadata: {},
};

function response(status: number, body: unknown = {}) {
  return Promise.resolve({ status, json: () => Promise.resolve(body) } as Response);
}

describe('validateFeedback', () => {
  it('requires a description and enforces limits', () => {
    expect(validateFeedback(report)).toEqual([]);
    expect(validateFeedback({ ...report, description: '  ' })).toEqual(['description_required']);
    expect(validateFeedback({ ...report, description: 'x'.repeat(2001) })).toEqual(['description_too_long']);
    expect(validateFeedback({ ...report, expected_result: 'x'.repeat(501) })).toEqual(['expected_too_long']);
  });
});

describe('submitFeedback', () => {
  it('posts JSON to /v1/feedback and returns the report id', async () => {
    const fetchImpl = jest.fn(() => response(201, { report_id: 'abc123' }));
    await expect(submitFeedback('https://pilot.example/', report, fetchImpl)).resolves.toEqual({
      status: 'sent',
      reportId: 'abc123',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://pilot.example/v1/feedback',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(report) }),
    );
  });

  it('reports offline when the network is unavailable', async () => {
    const fetchImpl = jest.fn(() => Promise.reject(new TypeError('Network request failed')));
    await expect(submitFeedback('https://pilot.example', report, fetchImpl)).resolves.toEqual({ status: 'offline' });
  });

  it('distinguishes rejected reports from server errors', async () => {
    await expect(submitFeedback('https://x', report, () => response(422))).resolves.toEqual({ status: 'rejected' });
    await expect(submitFeedback('https://x', report, () => response(500))).resolves.toEqual({ status: 'error' });
    await expect(submitFeedback('https://x', report, () => response(201, {}))).resolves.toEqual({ status: 'error' });
  });
});

it('formats a readable report for sharing', () => {
  const text = formatForSharing(report);
  expect(text).toContain('SignSpeak feedback');
  expect(JSON.parse(text.split('\n\n')[1] ?? '')).toEqual(report);
});
