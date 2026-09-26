# Development plan

Each phase ends with passing tests, updated documentation and logical commits. Status is kept current as work progresses.

Legend: ✅ done · 🟡 built, but waiting for verified content, a dataset or a decision · ⏳ not started · 🔒 blocked on external input

Phases 8 and 9 are complete as software. They show honest placeholders until verified ISL demonstrations exist. Phase 6 is complete as a pipeline, but no model can be trained until a consented dataset exists.

| # | Phase | Status | Deliverables | Exit criteria |
| --- | --- | --- | --- | --- |
| 1 | Repository audit + architecture | ✅ | Audit, `architecture.md`, `product-spec.md`, this plan, `privacy.md`, `contributing.md`, `.gitignore`, `.env.example` | Docs reviewed in PR |
| 2 | Mobile shell + navigation + design system | ✅ | Expo TS app, expo-router stack, theme tokens (light/dark), core components, Home | Typecheck + lint + tests green; home renders with a11y labels |
| 3 | Localization | ✅ | i18next, language registry, `en` complete, `hi` draft, others planned; app vs output language; persisted settings | Locale completeness test; language switch test |
| 4 | Camera screen | ✅ | Permission flow, front/back, framing guidance, pause/resume/clear, all error states | State tests with mocked camera |
| 5 | Recognition interface + mock inference | ✅ | `SignRecognizer`, `FrameSource`, `UnavailableRecognizer`, `MockSignRecognizer` (Demo mode), `PredictionStabilizer`, `RecognitionSession` | Stabilizer unit tests (stable, noisy, ambiguous, emergency, cooldown, duplicates) |
| 6 | Real ML pipeline | 🟡 | `signspeak_ml`: feature spec, MediaPipe extractor, dataset loader + signer splits, temporal model, trainer, evaluator, inference engine; `dataset.md`, `model-evaluation.md` | Pytest green on synthetic fixtures. **Real training 🔒 needs consented dataset** |
| 7 | ISL → Text | ✅ | Gloss → output-language text, transcript, history integration | Tests for mapping + transcript |
| 8 | Text → ISL | 🟡 | Content model, phrase normalizer/matcher, screen with unavailable/related states | Matcher tests incl. Hindi |
| 9 | Learn ISL | 🟡 | Categories, lessons, placeholders, progress, quiz engine (verified-only) | Quiz engine + progress tests |
| 10 | Speech | ✅ | `SpeechService` + expo-speech adapter, voice availability, error states | Service tests with mocked engine |
| 11 | Testing | ✅ | Coverage of navigation, localization, camera states, recognition, speech, errors; backend + ML suites; CI | CI green on PR |
| 12 | Performance | 🟡 | Frame-rate throttling, background pause, model size budget, startup profiling | Measured on a low-end Android device 🔒 |
| 13 | Privacy / security review | ✅ | Secrets scan, data-flow review, `privacy.md` update, dependency audit | Checklist complete |
| 14 | Production build | 🔒 | EAS build profiles, app config, store listing drafts | 🔒 needs owner's Expo/Play/App Store accounts |

## Current test inventory

| Suite | Tests | Covers |
| --- | --- | --- |
| Mobile (Jest + RNTL) | 217 | Navigation over the real route tree, localization completeness and placeholders, colour contrast, settings, camera permission/error states, recognition states, stabilizer, session, speech, history, Text → ISL, Learn, quiz, feedback |
| ML (pytest) | 72 | Feature contract parity, normalization, resampling, augmentation, MediaPipe result conversion, annotation validation, signer-level splits, dataset loading, model, training, calibration, metrics, packs, inference, CLI |
| Backend (pytest) | 35 | Validation, malformed input, model-unavailable, feedback privacy, size limits, CORS, error hygiene, retention |

## Production build (Phase 14): what the owner needs to decide or provide

`mobile/eas.json` has `preview` (internal APK) and `production` profiles. A production build needs:
1. The app identifier (`ios.bundleIdentifier`, `android.package`), which should be based on a domain the project controls
2. An Expo account/project (`eas init`) and signing credentials (managed by EAS or supplied)
3. A store listing, and a public privacy policy URL based on `docs/privacy.md` after legal review
4. The licence decision (D9) and the frame-processing decision (D4)

## Critical path items that code cannot solve

These need people and partners. They should start in parallel with engineering:

1. **ISL educators + Deaf community partners:** select and validate MVP vocabulary, choose regional variants, and review every demonstration.
2. **Verified demonstration media:** videos recorded by fluent Deaf signers with consent and a clear license.
3. **Consented dataset:** many signers, diverse conditions, and signer-level splits (see `docs/dataset.md`).
4. **Translation review:** native speakers review each UI language, with Hindi first.
5. **License decision** for code and content (owner).
6. **On-device frame-processing decision** (`architecture.md` D4, owner).

## Future roadmap (architected, not implemented)

Larger vocabulary → sequential/continuous recognition → ISL linguistic modeling → avatar rendering → speech → ISL → real-time two-way conversation → offline model packs per region → NGO deployment mode (shared-device lockdown, history disabled) → approved-dataset model improvement loop.
