# Contributing

Thank you for helping build an accessibility tool. Please read `docs/product-spec.md` and `docs/architecture.md` first.

## Ground rules

1. **Do not invent ISL.** Do not add sign demonstrations, glosses, grammar rules or claims about what a sign means unless they come from a qualified ISL educator or fluent Deaf signer and are recorded in the entry's `verification` metadata. When content is missing, leave a placeholder (`media: null`, `verification.status: "unverified"`).
2. **Do not overclaim.** No copy that says the app "translates ISL accurately" or "understands ISL". Uncertain output must stay uncertain.
3. **No hard-coded user-facing strings.** Add a key to `mobile/src/locales/en/common.json` and use `t("…")`. The locale completeness test enforces this for every language marked `complete`.
4. **No secrets, datasets or recordings in git.** Use environment variables (`.env.example` lists names only). Datasets go under the gitignored `ml/dataset/*/` folders.
5. **Accessibility is a requirement, not a polish step.** See the checklist below.

## Setup

```bash
# Mobile
cd mobile
npm ci
npm run start          # Expo dev server
npm test               # Jest
npm run typecheck
npm run lint

# ML
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"            # add ".[mediapipe]" for landmark extraction
pytest

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
uvicorn signspeak_api.main:app --reload
```

## Branches and commits

- Branch from `main`: `feat/…`, `fix/…`, `docs/…`.
- Use Conventional Commits: `feat: add camera experience`, `fix: …`, `test: …`, `docs: …`, `refactor: …`, `chore: …`.
- Keep commits focused on one logical change.

## Pull request checklist

- [ ] Tests added or updated, and `npm test` / `pytest` pass locally
- [ ] `npm run typecheck` and `npm run lint` pass
- [ ] No new hard-coded strings; new keys added to `en` (and other `complete` locales)
- [ ] Every new screen state (loading, empty, error…) is handled visibly
- [ ] Accessibility checklist below completed
- [ ] Docs updated if behaviour, data flow or architecture changed
- [ ] No secrets, personal data or dataset files included
- [ ] New dependency? Justify it in the PR description (why the existing stack is not enough, maintenance status, size)

## Accessibility checklist

- [ ] Every touchable has `accessibilityRole` and a meaningful `accessibilityLabel` (and `accessibilityHint` when the action is not obvious)
- [ ] Touch targets ≥ 48×48 dp
- [ ] Works at 200% system font size without clipped text
- [ ] Meaning never relies on colour alone or sound alone
- [ ] Status changes are announced (`accessibilityLiveRegion` / `AccessibilityInfo.announceForAccessibility`)
- [ ] Tested with TalkBack or VoiceOver when UI changed

## Adding a UI language

1. Copy `mobile/src/locales/en/common.json` to `mobile/src/locales/<code>/common.json` and translate the values.
2. Register the resource in `mobile/src/i18n/resources.ts` and set the language's `status` in `mobile/src/i18n/languages.ts` (`draft` until a native speaker has reviewed it).
3. Run `npm test`. The completeness test fails for a `complete` language with missing keys.

## Adding verified ISL content

See `mobile/src/content/README.md`. Every entry needs a source, a reviewer, a license for the media, and consent from the signer who appears in it.

## Reporting model failures

Use the in-app **Report a problem** flow or open an issue with the template in `docs/pilot.md`. Never attach video of people without their consent.
