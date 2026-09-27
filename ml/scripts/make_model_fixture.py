"""Writes shared/fixtures/model_parity_v1.json (pins the app's model code to PyTorch)."""

import json

from signspeak_ml.inference.app_export import FIXTURE_PATH, parity_fixture

FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
FIXTURE_PATH.write_text(json.dumps(parity_fixture(), indent=1) + "\n", encoding="utf-8")
print(f"wrote {FIXTURE_PATH}")
