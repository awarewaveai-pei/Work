.PHONY: validate semantic configurator artifact-static contracts adversarial bootstrap configurator-e2e configurator-http-e2e selection-matrix test manifest doc-numbers verify
validate:
	python scripts/validate_versions.py
	python scripts/validate_foundry.py
semantic:
	python scripts/validate_semantics.py
configurator:
	python scripts/validate_configurator.py
artifact-static:
	python scripts/validate_artifact_generation.py
contracts:
	python scripts/validate_contract_fixtures.py
adversarial:
	python scripts/run_adversarial_contract_tests.py
bootstrap:
	python scripts/test_bootstrap_e2e.py
configurator-e2e:
	python scripts/test_configurator_e2e.py
configurator-http-e2e:
	python scripts/test_configurator_http_e2e.py
selection-matrix:
	python scripts/test_selection_matrix.py
test:
	python -m unittest discover -s tests -v
manifest:
	python scripts/validate_manifest.py
doc-numbers:
	python scripts/validate_doc_numbers.py
verify: validate semantic configurator artifact-static contracts adversarial bootstrap configurator-e2e configurator-http-e2e selection-matrix test manifest doc-numbers
