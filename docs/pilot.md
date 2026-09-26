# NGO pilot guide

Status: **preparation document.** Adapt it with the partner NGO, Deaf community representatives and qualified ISL educators before use.

## 1. What a pilot can test today

| Area | Ready? | Notes |
| --- | --- | --- |
| App navigation, accessibility, languages (English, Hindi draft) | Yes | Collect usability and accessibility feedback |
| Sign → Text | **Demo mode only** | Simulated results, clearly labelled. Useful for UX feedback, **not** for communication |
| Text → ISL, Learn ISL | Structure only | Needs verified demonstrations before it can teach anything |
| Real sign recognition | No | Needs a consented dataset and a model that passes `docs/model-evaluation.md` §4 |

Do not present the app to participants as working sign recognition until a model passes the release criteria.

## 2. Before the pilot

- [ ] Partner agreement covering roles, data steward, contact for questions and deletion requests
- [ ] Participant information sheet and consent, presented in ISL by a fluent signer and in writing
- [ ] Hindi (and any other pilot language) UI translation reviewed by a native speaker
- [ ] Devices prepared (below)
- [ ] Decide whether feedback is shared manually (share sheet) or sent to a pilot server
- [ ] If using a server: deployed over HTTPS, `SIGNSPEAK_FEEDBACK_RETENTION_DAYS` agreed, purge job scheduled, access limited to named people

## 3. Device setup (shared phones)

1. Install the internal build (EAS internal distribution or APK).
2. Settings: choose the app language and output language, leave **history off** (default), and leave **demo mode off** unless it is a demo session.
3. Install an on-device text-to-speech voice for each output language (Android: Settings → Text-to-speech). The app tells users when a voice is missing.
4. Clear history and reset learning progress between participants on shared devices.

## 4. Collecting feedback

In the app: **Settings → Report a problem**, or **Report a wrong result** under a recognised sign.

A report contains only:

| Field | Example |
| --- | --- |
| `feature` | `sign_to_text` |
| `issue_type` | `wrong_recognition`, `not_recognized`, `accessibility`, `content`, `language`, `crash`, `performance`, `privacy`, `feature_request`, `other` |
| `description` | free text (the screen warns not to include personal details) |
| `expected_result` | optional |
| `model_prediction` | the shown label, and whether it was simulated |
| `environment` | app version, platform, OS version, app and output language |
| `metadata` | optional small key/values. Keys that look like personal data are refused |

Users send it through their phone's **share sheet** (email or WhatsApp to the pilot coordinator), or to the pilot server when one is configured (`EXPO_PUBLIC_API_BASE_URL`). If the phone is offline, the app says the report was not sent.

**Never** attach photos or videos of people to reports unless they gave consent for that specific use.

## 5. Bug reports and requests (GitHub)

Use the issue templates in `.github/ISSUE_TEMPLATE/`:
- **Bug report:** steps, expected vs actual, device, app version
- **Model failure:** intended sign, shown result, conditions (lighting, distance, camera, handedness) and demo mode yes/no. No video
- **Accessibility:** which screen, which assistive technology (TalkBack, font size, contrast) and what blocked the user
- **Feature request:** who needs it and why

## 6. Accessibility feedback prompts

- Could you find each main feature without help?
- Was the text large and clear enough? (Try the largest system font size.)
- Did TalkBack/VoiceOver read every button and status?
- Were messages like "Not sure what was signed" clear and useful?
- Was anything shown only by colour or only by sound?

## 7. Dataset contributions

Recording signers for model training is a **separate, consented activity** (`docs/dataset.md`). The app never records video.

## 8. Privacy and deletion during the pilot

- On the device: history is off by default. Settings lets users clear history and reset learning progress.
- Feedback on the server: kept for the agreed retention period, then purged. To delete a specific report, the participant quotes the report reference shown after sending.
- Contact: the partner's data steward (named in the information sheet).

## 9. Suggested pilot measures

- Task completion for scripted exchanges (with a human interpreter present)
- How often participants found output confusing or misleading
- Accessibility issues found, by severity
- Learner engagement (once verified lessons exist)
- Trust: "Would you rely on this app for …?" (expected answer during early pilots: *no*, and that is fine)
