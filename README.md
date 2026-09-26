# ISL Connect (`signspeak`)

A mobile app to help people communicate using **Indian Sign Language (ISL)**, built with and for Deaf ISL users, their families, and the hearing people they meet every day.

> **Honest status:** this project is in early development. **There is no trained sign-recognition model yet.** The app can show recognition only through a clearly labelled *Demo mode* that produces simulated results. No ISL demonstrations have been verified yet, so learning and Text → ISL screens show placeholders where verified content will go. The app is not a replacement for qualified ISL interpreters.

## Why

Most hearing people in India do not know ISL, and qualified interpreters are scarce. ISL Connect aims to make short everyday exchanges easier and to help more people learn ISL from verified content, while being careful never to present a guess as a translation.

## Planned experiences

| Experience | What it does |
| --- | --- |
| **Sign → Text** | Camera-based recognition of a small, curated ISL vocabulary → text in your chosen language → optional speech |
| **Text → ISL** | Look up a phrase in a verified ISL sign library (a phrase lookup, not full translation) |
| **Learn ISL** | Beginner lessons by category, practice, quizzes and on-device progress |

## Documentation

| Document | Contents |
| --- | --- |
| [docs/product-spec.md](docs/product-spec.md) | Users, features, responsible-AI rules, accessibility requirements |
| [docs/architecture.md](docs/architecture.md) | Repository audit, system design, interfaces, decision log |
| [docs/development-plan.md](docs/development-plan.md) | Phases, status, external dependencies |
| [docs/privacy.md](docs/privacy.md) | Data inventory, retention, deletion |
| [docs/contributing.md](docs/contributing.md) | Setup, conventions, accessibility checklist |

## Repository layout

```
docs/      product, architecture and policy documents
mobile/    Expo React Native app (TypeScript)       — Phase 2+
ml/        Python ML package and dataset layout      — Phase 6
backend/   optional FastAPI service                  — Phase 11
shared/    contracts shared between ML and mobile    — Phase 6
```

## License

No license has been chosen yet. That is the repository owner's decision.
