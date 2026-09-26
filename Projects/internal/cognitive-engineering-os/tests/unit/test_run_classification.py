"""A Recipe run's data classification comes from its Project, never from the request body (RESEARCH_LINES_MASTER_PLAN
WC-P1-07, K9)."""

from __future__ import annotations

import os
import uuid
from unittest.mock import patch

from ai_lego.apps.cli.run_life_decision_slice import fixture_source
from tests.unit.test_api_main import ApiTestCase

RUN_URL = "/recipes/life-decision-v1/run"


class RunClassificationTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self._login()
        self._env = patch.dict(os.environ, {"COGNITIVE_OS_JOURNAL_KEY_MODE": "disabled"}, clear=False)
        self._env.start()

    def tearDown(self):
        self._env.stop()
        super().tearDown()

    def _run(self, **extra):
        return self.client.post(RUN_URL, json={"source": fixture_source(), "run_id": "cls-" + uuid.uuid4().hex[:12], **extra})

    def test_a_confidential_project_makes_the_run_confidential(self):
        response = self._run(project_id=self._confidential_project_id())
        self.assertEqual(response.status_code, 503)
        self.assertIn("WORKFLOW_JOURNAL_PROTECTION_REQUIRED", response.text)

    def test_a_classification_in_the_body_is_refused_not_ignored(self):
        for value in ("CONFIDENTIAL", "INTERNAL"):
            response = self._run(data_classification=value)
            self.assertEqual(response.status_code, 400)
            self.assertIn("WORKFLOW_DATA_CLASSIFICATION_SERVER_DERIVED", response.text)

    def test_no_project_means_internal(self):
        self.assertEqual(self._run().status_code, 200)

    def test_an_unknown_project_is_404(self):
        self._confidential_project_id()  # installs the temp repository override
        self.assertEqual(self._run(project_id=str(uuid.uuid4())).status_code, 404)

    def test_a_non_string_project_id_is_400(self):
        self.assertEqual(self._run(project_id=123).status_code, 400)
