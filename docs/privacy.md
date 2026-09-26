# Privacy

Status: **engineering privacy design**, not legal advice. It must be reviewed against India's Digital Personal Data Protection Act, 2023 (DPDP Act) and partner requirements before any pilot.

## Principles

1. **Camera data stays on the device.** Frames are processed in memory and never written to disk or sent anywhere by the app.
2. **Collect nothing by default.** No accounts, no analytics SDKs, no advertising IDs, no crash reporters that capture screen content.
3. **Local first, user-controlled.** Anything stored (settings, progress, optional history) lives on the device and can be deleted from Settings.
4. **Explicit consent for anything that leaves the device.** This covers feedback submission, any future server inference, and dataset contributions. Each is separate, opt-in and explained in plain language.
5. **Minimize and expire.** Data that must be stored is minimal and has a stated retention period.

## Data inventory

| Data | Where | Leaves device? | Retention | Deletion |
| --- | --- | --- | --- | --- |
| Camera frames | Memory only, during Sign → Text | **Never** | Discarded immediately after processing | n/a |
| Landmarks (numeric hand/pose points) | Memory only | Not in current app. Future server inference would be opt-in only (see below) | Discarded after each window | n/a |
| Recognition results (text) | Screen. History only if the user enables it | No | Until cleared or superseded | Clear on screen, or clear history |
| History (recognized text, phrase lookups) | On-device storage, **off by default**, max 50 entries | No | Until the user clears it or turns history off (turning it off deletes it) | Settings → Clear history |
| Settings (languages, speech, camera, demo mode) | On-device storage | No | Until app uninstall | Uninstall / reset |
| Learning progress | On-device storage | No | Until reset | Settings → Reset learning progress |
| Feedback reports | Composed on device. Sent/shared only when the user taps Send | Yes, only on explicit action | Backend: 180 days (proposed) | Request via partner / contact (see below) |
| Analytics | **None** | — | — | — |
| Accounts | **None** | — | — | — |
| Recordings | The app **does not record** video | — | — | — |

## Third-party components

| Component | Data it sees | Notes |
| --- | --- | --- |
| Platform text-to-speech (Android TTS engine / iOS AVSpeechSynthesizer) via `expo-speech` | The text being spoken | iOS synthesizes on the device. On Android the behaviour depends on the installed engine: Google's engine can use network voices for some languages unless offline voices are installed. We document this to users in the speech settings help text |
| Expo / React Native runtime | None of the user's content | No Expo analytics or update service is enabled |
| Backend (optional, self-hosted by the deploying organization) | Feedback that the user chose to send | No IP logging beyond standard server logs. Log retention is set by the operator (recommended ≤ 30 days) |

## Server inference (not enabled)

If server inference is ever enabled:
- Only **landmark sequences** are sent, never images or video.
- A separate, specific consent prompt must be shown before the first use, and it can be revoked.
- Requests are not stored by default. The server keeps no request bodies.
- The data flow must be added to this document before release.

## Feedback

Feedback uses a minimal schema (see `docs/pilot.md`): feature, issue type, description, app/OS version, the model's prediction and the expected result. **No images, video, names, phone numbers or contact details** are requested. The free-text field shows a warning not to include personal information.

## Dataset collection (separate from the app)

Recording ISL signers for training is a separate, consented research activity governed by `docs/dataset.md`. The app does not collect training data.

## Deletion and requests

- Everything stored on the device can be deleted from Settings or by uninstalling.
- For feedback already sent, the deploying organization handles deletion requests. The contact is published in the pilot information sheet. Feedback records carry a random report ID that the user can quote.

## Security practices

- No secrets in source code. Configuration uses environment variables, and `.env.example` lists only variable names.
- Backend: input validation on every endpoint, request size limits, no raw media accepted.
- Dependencies are pinned via lockfiles and audited in CI.

## Open items before pilot

- Legal review (DPDP Act 2023; consent language in Indian languages, including accessible/ISL explanations of consent).
- Decide the feedback retention period with partners.
- Threat model for shared-device NGO deployments.
