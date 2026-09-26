# ISL Connect — mobile app

Expo (SDK 57) + React Native + TypeScript. Architecture: [`../docs/architecture.md`](../docs/architecture.md).

## Run

```bash
npm ci
npm run start        # then open in Expo Go or a development build
```

The camera needs a physical device. Everything else runs in a simulator.

## Check

```bash
npm test             # Jest + React Native Testing Library
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint (includes a rule against hard-coded JSX strings)
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/app/` | Routes (expo-router). Keep them thin; they render screens from `src/features/` |
| `src/features/` | Screens |
| `src/components/` | Design system. Use these instead of styling screens ad hoc |
| `src/theme/` | Colour, spacing and type tokens. Contrast is enforced by tests |
| `src/i18n/`, `src/locales/` | Localization. Every user-facing string is a key in `locales/en/common.json` |
| `src/settings/` | User settings (app language and output language are separate) |
| `src/storage/` | On-device key-value storage behind a small interface |

## Dependency notes

- `@testing-library/react-native` is pinned to 13.x because `expo-router/testing-library` renders synchronously. Version 14 made rendering async.
- `react-test-renderer` and `react-dom` are pinned to the exact `react` version so npm does not pull a newer React peer.
- `expo lint` is not used, to avoid Expo CLI telemetry calls. ESLint runs directly with `eslint-config-expo`.
