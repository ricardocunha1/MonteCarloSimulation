"""Opt-in smoke test against a real Azure DevOps (plans/release-plan-ado.md,
Phase 2). Skipped unless ADO_TEST_URL, ADO_TEST_PAT and ADO_TEST_AREA are set;
ADO_TEST_SOURCE is "onprem" (default) or "cloud". Run it with
`pytest -m ado_live`. Never commit a real PAT."""

import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

REQUIRED_ENV = ("ADO_TEST_URL", "ADO_TEST_PAT", "ADO_TEST_AREA")

pytestmark = [
    pytest.mark.ado_live,
    pytest.mark.skipif(
        not all(os.environ.get(name) for name in REQUIRED_ENV),
        reason="set ADO_TEST_URL, ADO_TEST_PAT and ADO_TEST_AREA to run the live Azure DevOps smoke test",
    ),
]


def test_live_connect_and_backlog():
    connection = {
        "source": os.environ.get("ADO_TEST_SOURCE", "onprem"),
        "projectUrl": os.environ["ADO_TEST_URL"],
        "pat": os.environ["ADO_TEST_PAT"],
    }
    client = TestClient(app)

    connected = client.post("/api/ado/connect", json=connection)
    # Only the error list is shown on failure, never the request (it holds the PAT).
    assert connected.status_code == 200, connected.json().get("errors")

    response = client.post(
        "/api/ado/backlog",
        json={**connection, "scopeType": "area", "scopePath": os.environ["ADO_TEST_AREA"]},
    )
    assert response.status_code == 200, response.json().get("errors")
    assert len(response.json()["workItems"]) >= 1
