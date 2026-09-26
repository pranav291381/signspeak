# Shared contracts

Files here are read by more than one component and must stay in sync.

| File | Producer | Consumers | Guard |
| --- | --- | --- | --- |
| `feature_spec_v1.json` | `signspeak-ml export-feature-spec` (`ml/signspeak_ml/features/spec.py`) | ML training, backend `/v1/recognize`, mobile (`mobile/src/recognition/featureSpec.ts`) | `ml/tests/test_features.py` and `mobile/src/recognition/__tests__/featureSpec.test.ts` fail on drift |

Do not edit the JSON by hand. Change the Python spec, bump the version, and regenerate it.
