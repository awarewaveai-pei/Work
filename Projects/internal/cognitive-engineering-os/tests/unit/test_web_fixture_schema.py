"""The browser's committed interpretation fixture must satisfy the shared 1.2.0 contract."""

from pathlib import Path
import json
import unittest

from ai_lego import resolve_spec_root
from ai_lego.core.contracts.schema_contracts import SchemaContracts


class WebFixtureSchemaTests(unittest.TestCase):
    def test_iceberg_interpretation_fixture_matches_contract(self):
        fixture_path = Path(__file__).parents[2] / "apps" / "cognitive-web" / "fixtures" / "iceberg-interpretation.json"
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        SchemaContracts(resolve_spec_root()).validate(
            "ai-lego://specs/cognitive/typed-objects/method-interpretation.schema.yaml",
            fixture,
            "web iceberg interpretation fixture",
        )


if __name__ == "__main__":
    unittest.main()
