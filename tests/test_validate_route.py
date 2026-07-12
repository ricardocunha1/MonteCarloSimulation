import io
from pathlib import Path

import pytest

from src.app import create_app

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "notebook" / "Sprint_History.xlsx"


@pytest.fixture()
def client():
    app = create_app()
    app.testing = True
    return app.test_client()


def _valid_form(**overrides):
    form = {
        "target_type": "Items Resolved",
        "target_value": "5",
        "num_simulations": "1000",
        "sprint_start_date": "2026-07-11",
        "sprint_length": "10",
        "exclude_latest_sprints": "1",
    }
    form.update(overrides)
    form["sprint_history_file"] = (io.BytesIO(FIXTURE_PATH.read_bytes()), "Sprint_History.xlsx")
    return form


def test_confirm_screen_shows_summary_and_targets_execute(client):
    response = client.post(
        "/validate", data=_valid_form(), content_type="multipart/form-data"
    )
    assert response.status_code == 200
    assert b"Sprint 24" in response.data
    assert b'action="/execute"' in response.data


def test_skip_validation_bypasses_confirm_screen_and_runs_simulation(client):
    response = client.post(
        "/validate",
        data=_valid_form(skip_validation="on"),
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    assert b"Sprint 24" not in response.data
    assert b"Distribution of Simulated Outcomes" in response.data
    assert b"P50" in response.data
    assert b"P95" in response.data


def test_non_excel_file_reports_parsing_error(client):
    data = _valid_form()
    data["sprint_history_file"] = (io.BytesIO(b"not an excel file"), "bad.xlsx")
    response = client.post("/validate", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    assert b"Could not read Excel file" in response.data
