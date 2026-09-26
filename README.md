# ISL Connect (`signspeak`)

A mobile app to help people communicate using **Indian Sign Language (ISL)**, built with and for Deaf ISL users, their families, and the hearing people they meet every day.

> **Honest status.**
> - **Sign → Text works for the signs you teach it.** You record each sign a few times on your phone (ideally a fluent signer does), and the camera then turns those signs into text and speech, saying "not sure" instead of guessing. There is **no general, pre-trained ISL recognizer yet**: that needs a consented ISL dataset (see `docs/dataset.md`).
> - **Text → ISL shows hand diagrams of recorded signs**, and fingerspells other words letter by letter using the alphabet recorded on the phone. The app ships **no** built-in ISL signs or alphabet images, because none could be verified. It never draws invented handshapes.
> - The Hindi interface is a draft awaiting native-speaker review.
>
> ISL Connect is **not** a replacement for qualified ISL interpreters.

## What is in the app

| | |
| --- | --- |
| **First launch** | Choose the app language and a light, dark or system look, then a short "how it works" |
| **Sign → Text** | Live camera with on-device hand and body tracking, drawn as a glowing hand skeleton over the video. Tells you at once whether hands are in view. Recognizes taught signs, joins fingerspelled letters into words, speaks the result, never guesses. Pause, switch camera, clear, report a wrong result |
| **Teach a sign** | Pick a common word, type any word or phrase, or record the whole alphabet letter by letter. Countdown, recording, an animated replay of each take, and checks (no one in view, no hands, too short, unlike your earlier takes) |
| **Text → ISL** | Type words and watch them as a sequence of animated hand diagrams, with captions, play/pause, step and slow motion. Anything not recorded yet is shown as such, with a button to record it |
| **Learn** | A map of all 26 letters as hand diagrams (recorded on the phone), and tips for communicating in sign language |
| **My signs** | Every taught sign with its takes, readiness, and delete controls |
| **Settings** | Appearance, app and output languages (separate), speech, camera, my signs, history (off by default), haptics, demo mode, report a problem |
| **Privacy** | Video never leaves the phone and is never saved. Taught signs are stored on the phone as hand-position numbers only |
| **ML pipeline** (`ml/`) | For a future general model: feature contract shared with the app, MediaPipe extraction, signer-level splits, temporal model, training, calibration, evaluation, checksummed model packs |
| **Backend** (`backend/`, optional) | Feedback collection and a landmark-only recognition endpoint. Stores no IP addresses or device IDs |

## Try it

You need Node.js 22 and the repository cloned.

```bash
cd mobile
npm ci          # also downloads the hand-tracking files for the web build
```

**On a laptop (web):** `npm run web`, then open http://localhost:8081 in Chrome, Edge or Safari. Allow the camera when asked. The first start loads hand tracking (about 25 MB, cached afterwards).

**On a phone (Expo Go):** install *Expo Go* from the Play Store or App Store, run `npm start` on a computer on the same Wi-Fi, and scan the QR code. The first time you open Sign → Text, the phone downloads hand tracking once (internet needed).

### How to use it

1. **Teach signs.** Home → *Teach a sign*. Choose what the sign means, press Record, wait for the countdown, sign once, and keep the take. Record each sign three times (letters: twice). Keep your head, shoulders and hands in view, in good light.
2. **Record the alphabet** (Learn → *Record the alphabet*) if you want names fingerspelled in Text → ISL and recognized in Sign → Text. Ask someone who knows ISL to record or check the letters.
3. **Sign → Text.** Point the camera at the signer. Signs you taught appear as text; press Speak to hear them.
4. **Text → ISL.** Type words; recorded signs play as hand diagrams and other words are fingerspelled.

## How recognition works

Hand and pose tracking (MediaPipe) runs on the phone inside the app's camera engine and produces body-centred hand and arm positions, about 15 times a second. Each taught sign is stored as a few recordings of those positions. Live signing is compared with every recording by dynamic time warping, which tolerates different speeds, and is also compared mirrored so left-handed signers match. Each sign gets its own acceptance distance from how consistent its recordings were. The existing stabilizer only shows a sign after several agreeing, confident, unambiguous predictions; otherwise it says it is not sure. Details: [`docs/architecture.md`](docs/architecture.md) §6.6–6.7.

Tested with synthetic landmark sequences (speed, position, noise, left-handed signers, mislabeled hands) and with **real MediaPipe output** from the app's engine on MediaPipe's own hand photos: repeats of a handshape match, different handshapes stay far apart, and an untaught handshape is rejected.

## Limitations

- Recognizes only the signs taught on that phone, the way they were taught; it has **not** been evaluated with real ISL signing across many signers, and "100%" accuracy cannot be promised by any recognizer. It is best for a small, consistent vocabulary.
- Hands, head and shoulders must be in view (the tracker normalizes by shoulder width). Fast fingerspelling is too quick: spell slowly, about one letter per second.
- No built-in, verified ISL content yet: diagrams and the alphabet exist only after someone records them.
- Text → ISL is sign by sign in the order typed, not translation: ISL grammar is not modelled.
- Not yet tested on physical phones in this environment: camera access inside the WebView on specific Android/iOS versions, frame rate on low-end phones, battery, TalkBack/VoiceOver.

## Repository layout

```
mobile/    Expo (SDK 57) React Native app, TypeScript
  engine/  Camera engine page (MediaPipe), bundled into the app by scripts/build-engine.mjs
ml/        Python package signspeak_ml: features, data, model, training, evaluation, inference
backend/   Optional FastAPI service: feedback + landmark-only recognition
shared/    Contracts shared by ML and mobile (feature_spec_v1.json, parity fixtures)
docs/      Product, architecture, privacy, dataset, evaluation, pilot, security review
```

## Development

```bash
# Mobile
cd mobile && npm ci
npm run start            # Expo dev server
npm test && npm run typecheck && npm run lint
npm run check:engine     # the bundled camera engine matches engine/*.ts (npm run build:engine to update)

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

## ML and dataset setup (general model, future)

1. Collect a consented, signer-diverse dataset following [`docs/dataset.md`](docs/dataset.md). Mount it outside git (`SIGNSPEAK_DATASET_ROOT`).
2. `signspeak-ml validate-annotations`, then `make-splits` (signer-level), then `extract-features`, then `train`.
3. Check the model against [`docs/model-evaluation.md`](docs/model-evaluation.md) release criteria before it is added alongside personal signs.

See [`ml/README.md`](ml/README.md).

## Documentation

| Document | Contents |
| --- | --- |
| [product-spec.md](docs/product-spec.md) | Users, features, responsible-AI rules, accessibility requirements |
| [architecture.md](docs/architecture.md) | System design, recognition, camera engine, interfaces, decision log |
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
- **Who records reference signs and the alphabet**, and how a reviewed "sign pack" should be shared between phones
- **App identifier, Expo account and store listing** for production builds

## License

No license has been chosen yet. That is the repository owner's decision.
