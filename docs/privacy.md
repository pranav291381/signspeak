# Privacy

Status: **engineering privacy design**, not legal advice. It must be reviewed against India's Digital Personal Data Protection Act, 2023 (DPDP Act) and partner requirements before any pilot.

## Principles

1. **Camera data stays on the device.** Frames are processed in memory and never written to disk or sent anywhere by the app.
2. **Collect nothing by default.** No accounts, no analytics SDKs, no advertising IDs, no crash reporters that capture screen content.
3. **Local first, user-controlled.** Anything stored (settings, taught signs, optional history) lives on the device and can be deleted in the app.
4. **Explicit consent for anything that leaves the device.** This covers feedback submission, any future server inference, and dataset contributions. Each is separate, opt-in and explained in plain language.
5. **Minimize and expire.** Data that must be stored is minimal and has a stated retention period.

## Data inventory

| Data | Where | Leaves device? | Retention | Deletion |
| --- | --- | --- | --- | --- |
| Camera frames | Memory only, inside the camera engine (WebView/iframe) during Sign → Text | **Never** | Discarded immediately after processing | n/a |
| Landmarks (numeric hand/pose points) while signing | Memory only | No. Future server inference would be opt-in only (see below) | Discarded after each window (≤ 3 s) | n/a |
| **Taught signs** (landmark recordings of signs the user taught, 2–5 takes each, ≤ 4 s per take). Teaching is paused; only signs taught with earlier versions exist | On-device storage, one entry per sign. Hand, arm and shoulder positions only: **no images or video** | No | Until the user deletes them | Settings → Delete all my signs (shown while any exist); uninstall |
| **Sign vocabulary** (sign packs shipped with the app) | App bundle (none included yet). Landmark numbers derived from sign videos the project has the right to use, plus the source's name, URL and permission statement. Nothing about the user | n/a (read only) | Replaced with app updates | n/a |
| Source videos used to build packs | Only on the computer of whoever runs `npm run build:signpack` (`mobile/.signpack-cache/`, git-ignored). Never on phones, never uploaded, never committed (CI rejects video files) | No | Until that person deletes the cache | Delete `mobile/.signpack-cache/` |
| Recognition results (text) | Screen. History only if the user enables it | No | Until cleared or superseded | Clear on screen, or clear history |
| History (recognized text, phrase lookups) | On-device storage, **off by default**, max 50 entries. Simulated demo results are never saved | No | Until the user clears it or turns history off (turning it off deletes it) | History → Clear history, or Settings → turn history off |
| Settings (languages, appearance, speech, camera, demo mode, whether the welcome was completed) | On-device storage | No | Until app uninstall | Uninstall |
| Feedback reports | Composed on device (Settings → Report a problem). Shared through the phone's share sheet, or sent to the pilot server only when the user taps Send and a server is configured | Yes, only on explicit action | Backend: 180 days (configurable, purge job) | Quote the report reference to the partner's data steward |
| Analytics | **None** | — | — | — |
| Accounts | **None** | — | — | — |
| Recordings | The app **does not record** video. "Recording" a sign stores only landmark numbers (row above) | — | — | — |

## Third-party components

| Component | Data it sees | Notes |
| --- | --- | --- |
| Platform text-to-speech (Android TTS engine / iOS AVSpeechSynthesizer) via `expo-speech` | The text being spoken | iOS synthesizes on the device. On Android the behaviour depends on the installed engine: Google's engine can use network voices for some languages unless offline voices are installed. We document this to users in the speech settings help text |
| Expo / React Native runtime | None of the user's content | No Expo analytics or update service is enabled |
| MediaPipe Tasks Vision (hand and pose tracking) | Camera frames, **on the device only** | Runs inside the app's camera engine. Its program (WASM) and model files (including MediaPipe's lite hand model) are downloaded once — from Google's model storage (`storage.googleapis.com`) and the jsDelivr CDN on phones, or from the app's own server on the web — checked against pinned SHA-256 hashes and cached. Downloading reveals the device's IP address to those servers, as any download does; no user content is sent. MediaPipe Tasks also sends usage telemetry to Google (`odml.pa.googleapis.com`) by default, with no option to turn it off; the engine page's Content Security Policy only allows connections to the file hosts, so this telemetry is blocked |
| Inter font (Google Fonts, OFL) | None | Bundled in the app; not fetched at runtime |
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

## Where things are stored on the device

| Key (AsyncStorage) | Contents |
| --- | --- |
| `islconnect.settings.v1` | Languages, appearance, speech, camera, history and demo-mode switches, welcome completed |
| `islconnect.history.v1` | Only when history is on: text of recognized signs and looked-up phrases, with time |
| `islconnect.signs.v1.index` | IDs of taught signs |
| `islconnect.signs.v1.item.<id>` | One taught sign: what it means (a library concept, a letter, or the word the user typed) and its takes as landmark numbers (Int16, base64) |

Older versions stored learning progress under `islconnect.progress.v1`; lessons and quizzes were removed and the key is no longer written.

**Why taught signs are sensitive.** Landmark recordings describe how a person moves and could, in principle, help identify them. They are therefore kept on the device only, shown in My signs, deletable per take, per sign or all at once, and never included in feedback reports (a report may include the recognized sign's label, which for a custom sign is the word the user typed; the report screen shows this before sending). Exporting or sharing recordings (for example to build a verified sign pack) must be a separate, explicit, consented action; the app has no such feature today.

AsyncStorage relies on the operating system's app sandbox and at-rest encryption. See `docs/security-review.md` for the accepted risk and plan.

## Security practices

- No secrets in source code. Configuration uses environment variables, and `.env.example` lists only variable names.
- Backend: input validation on every endpoint, request size limits, no raw media accepted.
- Dependencies are pinned via lockfiles and audited in CI (fails on high or critical issues in shipped dependencies).
- Review results and accepted risks: `docs/security-review.md`.

## Open items before pilot

- Legal review (DPDP Act 2023; consent language in Indian languages, including accessible/ISL explanations of consent).
- Decide the feedback retention period with partners.
- Threat model for shared-device NGO deployments.
