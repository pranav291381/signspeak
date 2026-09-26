# ISL Connect (`signspeak`)

A mobile app to help people communicate using **Indian Sign Language (ISL)**, built with and for Deaf ISL users, their families, and the hearing people they meet every day.

> **Honest status.** The app, the recognition pipeline and the ML tooling are built and tested, but:
> - **There is no trained sign-recognition model yet**, because no consented ISL dataset exists yet. Sign → Text says so. A *Demo mode* shows **simulated** results with a permanent banner, for demonstrations only.
> - **No ISL demonstrations have been verified yet.** Text → ISL and Learn ISL show clear placeholders instead of invented signs.
> - The Hindi interface is a draft awaiting native-speaker review.
>
> ISL Connect is **not** a replacement for qualified ISL interpreters.

## Why

Most hearing people in India do not know ISL, and qualified interpreters are scarce. ISL Connect aims to make short everyday exchanges easier and help more people learn ISL from verified content, without ever presenting a guess as a translation.

## What works today

| Experience | Status |
| --- | --- |
| **Home / navigation** | Five clear destinations, accessible components, light and dark themes |
| **Sign → Text** | Camera permission and error handling, front/back camera, framing guide, pause/resume/clear, "not sure" instead of guessing, stricter thresholds for emergency signs, results in the chosen output language, Speak button, screen-reader announcements and haptics. **Recognition itself is unavailable (no model). Demo mode is simulated** |
| **Text → ISL** | Phrase lookup in English and Hindi. Ambiguous words show every matching sign. No-match cases list related signs clearly labelled as *not a translation*. Placeholders until demonstrations are verified |
| **Learn ISL** | 9 categories and 58 candidate concepts, lessons, on-device progress, and a quiz engine that only uses verified signs (so it is unavailable today) |
| **Speech** | On-device text-to-speech in the output language. Reports a missing voice instead of using the wrong one |
| **History** | On-device only, off by default, never stores demo results |
| **Settings** | App language and output language set separately, speech, camera, privacy, demo mode, reset progress, **Report a problem** |
| **Localization** | English (complete), Hindi (draft), and 8 more Indian languages registered for translation |
| **ML pipeline** (`ml/`) | Landmark feature contract shared with the app, MediaPipe extraction, signer-level splits, temporal model, training, calibration, evaluation including the rate at which a wrong sign would be shown, checksummed model packs |
| **Backend** (`backend/`, optional) | Feedback collection and landmark-only recognition endpoint. Stores no IP addresses or device IDs |

## Limitations

- No recognition model and no dataset exist yet (see [`docs/dataset.md`](docs/dataset.md) for how one must be collected).
- The MVP vocabulary is a list of **candidate concepts** to be chosen with ISL educators. No sign has verified content.
- Text → ISL is phrase lookup, not translation. ISL grammar (sign order, space, facial grammar) is not modelled.
- On-device landmark extraction needs a decision on camera frame processing ([`docs/architecture.md`](docs/architecture.md) D4).
- Not measured on real devices yet: performance, battery and on-device accessibility (TalkBack/VoiceOver).

## Repository layout

```
mobile/    Expo (SDK 57) React Native app, TypeScript
ml/        Python package signspeak_ml: features, data, model, training, evaluation, inference
backend/   Optional FastAPI service: feedback + landmark-only recognition
shared/    Contracts shared by ML and mobile (feature_spec_v1.json)
docs/      Product, architecture, privacy, dataset, evaluation, pilot, security review
```

## Development

```bash
# Mobile
cd mobile && npm ci
npm run start            # Expo dev server (camera needs a physical device)
npm test && npm run typecheck && npm run lint

# ML
cd ml && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"  # add ".[mediapipe]" for video landmark extraction
pytest

# Backend (optional)
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]" && pytest
uvicorn signspeak_api.main:app --reload
```

Configuration uses environment variables only. See [`.env.example`](.env.example). CI (`.github/workflows/ci.yml`) runs all three test suites, lint, typecheck, a dependency audit and a check that no datasets, recordings, weights or secrets are committed.

## ML and dataset setup

1. Collect a consented, signer-diverse dataset following [`docs/dataset.md`](docs/dataset.md). Mount it outside git (`SIGNSPEAK_DATASET_ROOT`).
2. `signspeak-ml validate-annotations`, then `make-splits` (signer-level), then `extract-features`, then `train`.
3. Check the model against [`docs/model-evaluation.md`](docs/model-evaluation.md) release criteria before it replaces "recognition unavailable" in the app.

See [`ml/README.md`](ml/README.md).

## Documentation

| Document | Contents |
| --- | --- |
| [product-spec.md](docs/product-spec.md) | Users, features, responsible-AI rules, accessibility requirements |
| [architecture.md](docs/architecture.md) | Audit, system design, interfaces, stabilizer, decision log |
| [development-plan.md](docs/development-plan.md) | Phase status, test inventory, what needs people or decisions |
| [privacy.md](docs/privacy.md) | Data inventory, storage, retention, deletion |
| [security-review.md](docs/security-review.md) | Review results and accepted risks |
| [dataset.md](docs/dataset.md) | Consent, annotation format, anonymization, splits, licensing, versioning |
| [model-evaluation.md](docs/model-evaluation.md) | Metrics, calibration, release criteria, model cards |
| [pilot.md](docs/pilot.md) | NGO pilot preparation, feedback collection, accessibility prompts |
| [contributing.md](docs/contributing.md) | Conventions, PR and accessibility checklists, adding languages and content |

## Contributing

Read [`docs/contributing.md`](docs/contributing.md). In short: do not invent ISL content, never overclaim accuracy, localize every string, keep data out of git, and treat accessibility as a requirement.

## Decisions waiting for the repository owner

- **License** for code and content (none chosen yet)
- **Camera frame processing** for on-device landmarks (likely `react-native-vision-camera` plus a MediaPipe plugin in a dev build)
- **App identifier, Expo account and store listing** for production builds

## License

No license has been chosen yet. That is the repository owner's decision.
