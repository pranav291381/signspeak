# Privacy and security review (Phase 13)

Date: 2026-09-26. Scope: repository state at the end of the first build session. Re-run this review before every pilot or release.

## Checks performed

| Check | Result |
| --- | --- |
| Secret-like strings across **full git history** (API keys, tokens, private keys, cloud credentials) | None found. The only match was a deliberately fake password in a backend test that checks error responses do not leak details |
| Tracked datasets, recordings, model weights, keys, `.env` files | None. Also enforced in CI (`repository-hygiene` job) and `.gitignore` |
| Tracked virtualenvs, `node_modules`, databases, caches | None |
| App permissions | Camera only. Microphone explicitly disabled (iOS usage string removed, Android `RECORD_AUDIO` blocked). Barcode scanner disabled |
| Network use by the app | Only the user-initiated "Send to project team" feedback request, and only when `EXPO_PUBLIC_API_BASE_URL` is configured. No analytics, crash reporting, OTA updates or ad SDKs are installed |
| Camera frames | Preview only (`expo-camera`). No capture, recording or upload code exists |
| Logging | One `console.warn` when settings cannot be saved (no user content). The backend never logs request bodies and error responses never echo submitted values |
| Local storage | Settings, optional history (off by default, max 50 text entries) and learning progress in AsyncStorage (app sandbox). Clearing and reset are available in the app |
| Backend input handling | Strict schemas (unknown fields rejected), bounded sizes, finite numbers only, `Content-Length` required, 1 MB limit, CORS allow-list, generic 500s |
| Deep links (`signspeak://`) | Route params are validated: an unknown sign shows "not found", invalid teach parameters show "nothing to record". Feedback params only pre-fill a form the user reviews before sharing |
| Camera engine (WebView / iframe) | The page is bundled with the app (no remote HTML). It only fetches the MediaPipe WASM and model files, each checked against a SHA-256 pinned at build time (by role, so a swapped file fails), and posts only landmark numbers. A Content Security Policy (`connect-src`) limits its network access to the hosts serving those files, which also blocks MediaPipe's built-in usage telemetry. Host ↔ engine messages are tagged and validated on both sides; the web host accepts messages only from its own iframe. Stored taught signs are validated field by field on load; damaged takes are dropped |
| Sign packs (added 2026-09-27) | Bundled with the app, not downloaded. Still parsed as untrusted input (`signpack/parse.ts`): format, version, feature spec and frame rate must match; ids must carry the pack prefix; sample sizes must match their data; only `http(s)` source links are kept; out-of-range thresholds are ignored; a broken sign or pack is skipped, not fatal. The builder (`scripts/build-sign-pack.mjs`) runs only on a developer's computer: it serves files to a headless browser on `127.0.0.1` only, confines `/mediapipe/` paths to that folder, serves videos only by cache key, and identifies itself with a User-Agent when downloading |
| New dependencies (2026-09-27) | `expo-file-system` (part of the Expo SDK, reads bundled packs on phones). `playwright-core` (dev only, drives an installed Chrome/Edge for the pack builder; not in the app bundle, downloads no browser) |
| Dependency audit (shipped mobile dependencies) | `npm run audit:deps` (CI): fails on any high or critical advisory except those in `mobile/scripts/audit-allowlist.json`, and reports allowed entries that are no longer found so they can be removed. 2026-10-08: `shell-quote` and `source-map-js` updated; two high advisories with no fixed version allowed by the owner (below) |
| New dependency (2026-10-08) | `expo-sharing` (Expo SDK, opens the share sheet for Export my signs; its share-extension plugin is not enabled) |

## Known issues and accepted risks

| Issue | Risk | Plan |
| --- | --- | --- |
| `decode-uri-component@0.2.2` via `expo-router → query-string` (GHSA-vcc3-ghjq-m6fr, DoS on malformed percent-encoding) | Low. A malicious deep link could at most freeze the app briefly | Update when Expo ships a fixed `expo-router`. Do not force-override Expo's pinned versions |
| `braces` via `micromatch` (Metro, Jest), GHSA-vfj7-8cjw-p6xm, high: stack exhaustion on deeply nested glob patterns | Build tooling only; patterns come from the project's own config, not users. Not in the app bundle | Allowed (owner, 2026-10-08) until a fixed version ships; then remove from the allowlist |
| `node-forge` via `@expo/cli` (code signing), GHSA-86w9-cpqp-85rv, high: RSA PKCS#1 v1.5 signature check too lenient | Developer CLI only (signing of development/update manifests). Not in the app bundle | Allowed (owner, 2026-10-08) until a fixed version ships; then remove from the allowlist |
| `uuid@7` via `@expo/config-plugins → xcode` (GHSA-w5hq-g745-h8pq) | Build-time tooling only. Not shipped in the app bundle | Update with the Expo SDK |
| AsyncStorage is not encrypted beyond the OS's own at-rest encryption | History text could be read on a rooted or compromised device | History is off by default. Consider `expo-secure-store` or encrypted storage before enabling history in NGO deployments |
| Android TTS engines may use network voices | Spoken text might be sent to the TTS provider | Documented in `privacy.md`. Pilot devices should install offline voices |
| Backend has no authentication or rate limiting | Spam feedback, or abuse of `/v1/recognize` if a model is deployed | Deploy behind a reverse proxy with rate limits. Add auth before non-pilot use |
| Backend creates its schema at start-up | Schema drift | Add Alembic migrations before production |
| Hindi UI and sign meanings are unreviewed drafts | Misunderstanding | Marked as drafts in the UI. Native-speaker review is required before any pilot |

## Checklist for future changes

- [ ] New dependency? Justify it, audit it, and check what data it sends
- [ ] New storage? Add it to the data inventory in `privacy.md` with retention and deletion
- [ ] New network call? It must be user-initiated or consented, and documented
- [ ] Anything touching the camera? Frames must never be written to disk or uploaded without explicit, specific consent
- [ ] Re-run the secret scan: `git log -p --all | grep -Ei "api[_-]?key|secret|token|BEGIN .*PRIVATE"`
