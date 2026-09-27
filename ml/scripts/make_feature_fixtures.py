"""Regenerate shared/fixtures/feature_parity_v1.json. Run from ml/: python scripts/make_feature_fixtures.py"""

from signspeak_ml.features.fixtures import FIXTURE_PATH, fixture_json

if __name__ == "__main__":
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(fixture_json(), encoding="utf-8")
    print(f"wrote {FIXTURE_PATH}")
