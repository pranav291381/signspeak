# Architecture — ISL Connect (repository: `signspeak`)

Status: **living document**. Update it whenever a component, interface, or decision changes.

---

## 1. Repository audit (Phase 1, 2026-09-26)

| Item | Finding |
| --- | --- |
| Commits | One commit (`Initial commit`) |
| Files | `README.md` containing only `# signspeak` |
| Framework | None |
| Source code | None. No earlier camera prototype exists in this repository |
| Dependencies / build scripts / config | None |
| Tests / CI | None |
| Secrets | None found (manual grep of tracked files and history) |
| License | **None.** Licensing is an owner decision (see §14) and has not been chosen here |

Conclusion: nothing needs preserving or refactoring. The project starts from the stack recommended in the build brief:

- **Mobile:** React Native + Expo + TypeScript
- **Backend:** Python + FastAPI (optional services only, no raw video)
- **ML:** Python + PyTorch + MediaPipe landmarks
- **Tests:** Jest + React Native Testing Library, Pytest
- **CI:** GitHub Actions

Environment note: `download.pytorch.org` is blocked by this development environment's network policy. CPU PyTorch has to come from PyPI, and CI installs it the same way (see `ml/README.md`).

---

## 2. Principles that shape the architecture

1. **Honesty over fluency.** When recognition is uncertain the output is an explicit *uncertain* state, never a guess. Mock components always identify themselves as simulated.
2. **On-device first.** Camera frames never leave the phone by default. Server components receive landmarks or text, never raw video, and only with consent.
3. **Replaceable intelligence.** The UI depends on interfaces (`SignRecognizer`, `FrameSource`, `SpeechService`, `ContentRepository`), not on specific models.
4. **Verified content only.** ISL demonstrations, glosses and meanings come from reviewed content. Unverified entries are data placeholders with an explicit `verification.status`.
5. **Localization from day one.** No user-facing string is written inline. The app language and the speech/output language are separate settings.
6. **Every state is designed.** Loading, empty, unknown, low confidence, no camera, no permission, no network, model error, speech error, unsupported language, content unavailable.

---

## 3. System overview

```
                    ┌──────────────────────── Mobile app (Expo, on-device) ────────────────────────┐
                    │                                                                                │
 PHONE CAMERA ──▶ FrameSource ──▶ FeatureExtractor ──▶ WindowBuffer ──▶ SignRecognizer ──▶ Stabilizer │
                    │   (frames)     (landmarks v1)     (sliding T)     (class probs)    (stable /   │
                    │                                                                  uncertain)  │
                    │                                                        │                     │
                    │                                                        ▼                     │
                    │                                    Gloss ─▶ Output text (output language)   │
                    │                                                        │                     │
                    │                                                        ▼                     │
                    │                                               SpeechService (optional)       │
                    │                                                                                │
 TEXT INPUT ─────▶ Normalizer ──▶ PhraseMatcher ──▶ Verified sign library ──▶ Demonstration view    │
                    │            (future: ISL linguistic transformation → sign sequence → avatar)   │
                    │                                                                                │
 LEARN ISL ─────▶ Lessons ──▶ Demonstration ──▶ Practice ──▶ Quiz ──▶ Progress (local storage)       │
                    └────────────────────────────────────────────────────────────────────────────────┘
                                   │ optional, consented, text/landmarks only
                                   ▼
                    ┌──────────── Backend (FastAPI) ─────────────┐
                    │ /health  /v1/model  /v1/recognize          │
                    │ /v1/feedback  (content/model-pack delivery │
                    │  planned)                                  │
                    └────────────────────────────────────────────┘

                    ┌──────────── ML (offline, Python) ──────────┐
                    │ dataset → features → temporal model →      │
                    │ evaluation (signer-independent) → export   │
                    │ → versioned model pack for mobile          │
                    └────────────────────────────────────────────┘
```

---

## 4. Repository layout

```
/
├── README.md
├── .env.example            # variable names only, never values
├── .github/workflows/      # CI
├── docs/                   # product, architecture, privacy, dataset, evaluation, pilot
├── mobile/                 # Expo React Native app (TypeScript, Expo SDK 57)
│   └── src/
│       ├── app/            # expo-router routes (thin files that render feature screens)
│       ├── components/     # design system: Screen, AppText, Button, Card, Notice, StateView…
│       ├── theme/          # tokens: color (light/dark), spacing, typography, radii
│       ├── accessibility/  # reduce-motion and other a11y hooks
│       ├── storage/        # KeyValueStore interface (AsyncStorage / in-memory for tests)
│       ├── i18n/           # i18next setup, language registry
│       ├── locales/        # <lang>/common.json
│       ├── settings/       # settings model, persistence, provider
│       ├── recognition/    # interfaces, mock recognizer, stabilizer, session
│       ├── camera/         # camera state handling
│       ├── speech/         # SpeechService abstraction
│       ├── content/        # sign library, lessons, phrase matcher
│       ├── learn/          # progress, quiz engine
│       ├── history/        # local history store
│       ├── feedback/       # feedback schema + report composer
│       └── features/       # screens: home, sign-to-text, text-to-isl, learn, history, settings
├── backend/                # FastAPI service (optional; no raw video)
├── ml/                     # Python package `signspeak_ml` + dataset layout (data is gitignored)
└── shared/                 # cross-component contracts (feature spec, schemas)
```

---

## 5. Mobile app

### 5.1 Layers

| Layer | Responsibility | Depends on |
| --- | --- | --- |
| `src/app/` routes | Navigation only | `features/` |
| `features/*` | Screens: compose components, call services via hooks | components, services |
| `components/` + `theme/` | Design system, accessibility defaults (48dp targets, roles, labels) | nothing app-specific |
| Services (`recognition`, `speech`, `content`, `history`, `settings`) | Business logic as plain TypeScript, unit-tested without React | platform adapters |
| Platform adapters | `expo-camera`, `expo-speech`, AsyncStorage, `expo-localization` | Expo SDK |

Plain-TypeScript services keep the logic testable and let a platform library be swapped without touching screens.

### 5.2 Navigation

A stack rooted at Home, with no tabs, so there is one obvious way back:

```
Home ─┬─ Sign → Text
      ├─ Text → ISL
      ├─ Learn ISL ── Category ── Lesson (── Quiz)
      ├─ History
      └─ Settings ── Report a problem
```

### 5.3 Feature state model

Every feature screen renders from a discriminated union rather than ad-hoc booleans, so there is no silent failure path. For example, `SignToTextState`:

```
idle | loading | no_permission | permission_denied_permanently | no_camera
| model_unavailable | model_error | listening | uncertain | recognized | paused
```

`StateView` (design system) renders the icon + title + message + recovery action for each non-happy state.

---

## 6. Recognition pipeline

### 6.1 Interfaces (TypeScript, `mobile/src/recognition/`)

```ts
interface LandmarkFrame {        // one camera frame, feature contract v1 (shared/feature_spec_v1.json)
  timestampMs: number;
  values: Float32Array | null;   // flattened, normalized; null when nobody was detected
}

interface FrameSource {          // camera → landmark frames
  start(onFrame: (f: LandmarkFrame) => void): void;
  stop(): void;
}

interface SignRecognizer {       // window of frames → class probabilities
  readonly info: RecognizerInfo; // id, kind ('simulated' | 'on_device' | 'remote'), labels, calibrated
  load(): Promise<void>;         // throws RecognizerUnavailableError when no model is installed
  predict(window: LandmarkFrame[]): Promise<RawPrediction>;
  dispose(): void;
}

interface RawPrediction { scores: { label: string; score: number }[]; latencyMs: number }
```

`RecognitionSession` wires `FrameSource → WindowBuffer → SignRecognizer → PredictionStabilizer` and emits a `RecognitionUpdate` (`listening | uncertain | recognized`) to the UI hook. The UI never calls a model directly.

### 6.2 Implementations

| Implementation | Status | Notes |
| --- | --- | --- |
| `UnavailableRecognizer` + `NoFrameSource` | Implemented | Default. Reports `model_unavailable` honestly, and the camera is not opened |
| `MockSignRecognizer` + `SimulatedFrameSource` | Implemented | Scripted outputs, including uncertain and noisy sequences. Only reachable by switching on **Demo mode**, and the UI shows a persistent "Simulated — not real recognition" banner |
| `OnDeviceSignRecognizer` | Planned (Phase 6→7) | Runs an exported model pack (TFLite or ONNX) |
| `LandmarkFrameSource` | Planned | Needs per-frame camera access. See the decision in §14 |

### 6.3 Feature contract (train/serve parity)

Training (Python MediaPipe) and inference (mobile) have to produce identical feature vectors. The contract lives in `shared/feature_spec_v1.json` and is generated from and tested against `ml/signspeak_ml/features/spec.py`:

- Landmarks: 21 left-hand + 21 right-hand + a subset of upper-body pose (nose, shoulders, elbows, wrists, hips). Face landmarks are reserved for v2, because non-manual markers matter in ISL.
- Coordinates: x, y, z normalized by shoulder midpoint (origin) and shoulder width (scale). This makes the vector robust to distance and framing.
- Presence flags for each hand. A missing hand is encoded as zeros + flag 0 rather than dropped.
- Fixed frame rate (resampled to 15 fps) and window length (default 32 frames ≈ 2.1 s).

Any change to the contract bumps its version. Model packs declare the version they need, and the app refuses a mismatched pack.

### 6.4 Stabilization layer (`PredictionStabilizer`)

Frame-level outputs are noisy. The stabilizer (`mobile/src/recognition/stabilizer.ts`, config in `config.ts`) turns them into a result a person can trust. All values are configurable and validated:

| Parameter | Default | Purpose |
| --- | --- | --- |
| `smoothingWindow` | 5 | Mean of the class scores over the last N predictions |
| `minConfidence` | 0.70 | Smoothed top score must reach this |
| `minMargin` | 0.15 | Gap between the top-1 and top-2 smoothed scores (guards against ties) |
| `minStablePredictions` | 4 | "Minimum stable frames": consecutive predictions whose raw top label agrees with the smoothed candidate |
| `emergencyMinConfidence` | 0.85 | Stricter confidence threshold for signs flagged `emergency` in the library |
| `emergencyMinStablePredictions` | 6 | Stricter agreement for emergency signs |
| `cooldownMs` | 1200 | After a result, wait before showing a *different* sign |
| `duplicateSuppressionMs` | 2500 | The same sign is shown again only after it was released (hands dropped or a different sign) **and** this much time passed |
| `uncertainAfterPredictions` | 8 | Predictions of activity without a result before telling the user "not sure" |
| `highConfidenceThreshold` | 0.90 | Calibrated recognizers only: boundary between "high" and "medium" bands |

The unknown class (`__unknown__`) is never shown as text. Non-finite scores count as zero, so a malfunctioning model produces "not sure" rather than a sign.

Each prediction produces a `StabilizerStep`:
- `no_signer`: nobody in view. Evidence is reset
- `analyzing`: watching, not enough evidence yet (or a held sign that was already shown)
- `uncertain` + reason (`low_confidence | ambiguous | unknown_sign | unstable`): shown as "Not sure what was signed. Please try again." with a hint
- `recognized` + `Recognition { label, band, timestampMs }`

A confidence **band** is reported only when the recognizer declares `calibrated: true`. Uncalibrated and simulated recognizers show no numbers and no bands.

`RecognitionSession` adds backpressure: while a prediction is running, new windows are skipped rather than queued. It also skips the model entirely when fewer than half the frames in a window contain a person, and reports `model_error` after three consecutive inference failures.

### 6.5 Model packs (planned)

```
model-pack/
  manifest.json   # id, version, feature_spec_version, labels, calibration, metrics summary, license
  model.tflite | model.onnx
  labels.json
```

Packs are bundled or downloaded, verified by checksum, and cached for offline use. Label IDs match `content` entry IDs so a recognized sign can link to its lesson.

---

## 7. Text → ISL

```
text ─▶ normalize (Unicode NFC, case, punctuation, whitespace)
     ─▶ PhraseMatcher (MVP: whole-phrase match against verified library, per language)
     ─▶ match     → SignEntry (gloss, demonstration media, verification status)
     ─▶ no match  → "not available yet" + related entries clearly labelled as separate signs
```

**MVP limit (stated in the UI):** this is a phrase lookup, not translation. ISL has its own grammar (word order, spatial reference, non-manual markers), so substituting signs word by word is not ISL.

The designed extension point is `TextToIslPipeline`:
`normalize → LinguisticTransformer (future: ISL grammar, reviewed by linguists) → SignSequence → Renderer (video | avatar)`.
Only `normalize` and a phrase-lookup "transformer" exist today.

## 8. Learn ISL

Content model (`mobile/src/content/types.ts`):

- `SignEntry`: `id`, `gloss`, `category`, `meanings{lang}`, `phrases{lang}`, `media` (nullable), `verification{status, reviewedBy, reviewedAt, source, license}`, `regionalVariantOf`
- `Lesson`: ordered `signIds`, `category`, `level`
- `Progress`: per-sign `seen` / `practiced` / `quizCorrect` timestamps (on-device only)

A sign whose `media` is `null` or whose verification is not `verified` renders a **"Demonstration not yet available"** placeholder. Quizzes only use signs with verified media. This keeps the learning module safe to ship before content exists.

## 9. Localization

- `i18next` + `react-i18next`. Resources are imported statically from `mobile/src/locales/<lang>/common.json` so they work offline.
- A language registry lists `code`, native name, script, text direction and translation `status` (`complete | draft | planned`). Only `complete` and `draft` languages are selectable. `draft` translations are labelled as awaiting native-speaker review.
- Settings keep **`appLanguage`** (UI) and **`outputLanguage`** (recognized-text rendering and speech) separate. Example: Hindi UI with English speech.
- Missing keys fall back to English and are caught by a completeness test.

## 10. Speech

`SpeechService.speak(text, language)` returns a result union: `ok | unsupported_language | engine_unavailable | error`. The `expo-speech` adapter uses the platform's on-device TTS. It checks the installed voices for the requested language and reports `unsupported_language` rather than silently speaking with the wrong voice. Spoken output is always also shown as text, because sound alone never carries critical information.

## 11. Offline strategy

| Capability | Offline? |
| --- | --- |
| UI, settings, localization | Yes (bundled) |
| Learning content, progress | Yes (bundled + local storage) |
| Speech | Yes, if the device has an on-device voice for the language |
| Recognition | Yes, once an on-device model pack exists (none today) |
| Feedback submission | Queued/exported locally, sent when online (planned) |

## 12. Backend (`backend/`)

The backend is optional, and the app works fully without it.

- `GET /health`
- `GET /v1/model`: info about the server-side model, or "none installed"
- `POST /v1/recognize`: accepts a **landmark sequence** (feature contract v1), never images or video. Returns ranked labels or `503 model_unavailable`. Intended for research/evaluation and opt-in use only
- `POST /v1/feedback`: structured, minimal feedback (see `docs/pilot.md`)

Persistence: SQLAlchemy, with SQLite for local development/tests and PostgreSQL in deployment (`DATABASE_URL`). No accounts exist.

## 13. ML (`ml/`)

Package `signspeak_ml` with small, replaceable interfaces:

| Interface | Responsibility |
| --- | --- |
| `FeatureExtractor` | video → landmark sequence (MediaPipe implementation; optional dependency) |
| `DatasetLoader` | annotations (JSONL) + processed features → samples; enforces signer-level splits |
| `SignRecognizer` / `InferenceEngine` | model + labels → ranked predictions for a window |
| `ModelTrainer` | training loop, checkpoints, reproducible seeds |
| `Evaluator` | accuracy, macro P/R/F1, confusion matrix, per-sign, per-signer, latency |

The first model is a small temporal classifier (1D temporal convolutions + GRU, with attention pooling) over landmark sequences. It is deliberately modest, and transformers or continuous recognition come later (see `docs/development-plan.md`). Details are in `docs/dataset.md` and `docs/model-evaluation.md`.

---

## 14. Decision log

| # | Decision | Rationale | Status |
| --- | --- | --- | --- |
| D1 | Expo + TypeScript for mobile | Brief's preferred stack. Managed builds, first-party camera/speech/localization modules | Accepted |
| D2 | `expo-router` for navigation | Expo default. Typed routes and deep links (e.g. open a lesson from a recognized sign) | Accepted |
| D3 | `expo-camera` for the camera preview and permission flow in the MVP | First-party and stable, and works in Expo Go. It does **not** expose per-frame processing | Accepted for MVP |
| D4 | Real-time landmark extraction on device | Likely `react-native-vision-camera` frame processors + a MediaPipe/TFLite plugin in an Expo dev build. **Major dependency, so this needs owner sign-off before adoption** | **Open, needs owner decision** |
| D5 | `i18next` + `react-i18next` + `expo-localization` | Mature, supports plurals/interpolation, and resources are statically bundled for offline use | Accepted |
| D6 | No raw video leaves the device by default. The server accepts landmarks only | Privacy (see `docs/privacy.md`) | Accepted |
| D7 | Recognition defaults to `UnavailableRecognizer`. The mock is opt-in "Demo mode" with a persistent banner | Never present simulated output as real | Accepted |
| D8 | History is stored on device only and is **off by default** | Shared phones at NGO sites, and conversation text is sensitive | Accepted, revisit with pilot partners |
| D9 | No license file added | Licensing is the owner's decision | **Open, needs owner decision** |
| D10 | Content lives in the app bundle as typed JSON with verification metadata | Works offline. Can later be delivered by the backend as versioned packs | Accepted |
