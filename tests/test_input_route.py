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
    return form


def _with_dummy_file(form):
    form["sprint_history_file"] = (io.BytesIO(b"dummy"), "sample.xlsx")
    return form


def _with_fixture_file(form):
    form["sprint_history_file"] = (io.BytesIO(FIXTURE_PATH.read_bytes()), "Sprint_History.xlsx")
    return form


def test_index_renders_input_form(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b'name="sprint_history_file"' in response.data


def test_missing_file_returns_error(client):
    response = client.post("/validate", data=_valid_form(), content_type="multipart/form-data")
    assert response.status_code == 200
    assert b"file" in response.data.lower()
    assert b"required" in response.data.lower()


def test_too_many_simulations_returns_error(client):
    data = _with_dummy_file(_valid_form(num_simulations="20001"))
    response = client.post("/validate", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    assert b"20000" in response.data


def test_negative_target_value_returns_error(client):
    data = _with_dummy_file(_valid_form(target_value="-1"))
    response = client.post("/validate", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    assert b"Target Value" in response.data


def test_negative_sprint_length_returns_error(client):
    data = _with_dummy_file(_valid_form(sprint_length="-10"))
    response = client.post("/validate", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    assert b"Sprint Length" in response.data


def test_invalid_date_returns_error(client):
    data = _with_dummy_file(_valid_form(sprint_start_date="not-a-date"))
    response = client.post("/validate", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    assert b"Sprint Start Date" in response.data


def test_negative_team_capacity_factor_returns_error(client):
    data = _with_dummy_file(_valid_form(team_capacity_factor="-1.0"))
    response = client.post("/validate", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    assert b"Team Capacity Factor" in response.data


def test_blank_team_capacity_factor_does_not_error(client):
    data = _with_fixture_file(_valid_form(team_capacity_factor=""))
    response = client.post("/validate", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    assert b"Sprint 24" in response.data


def test_valid_params_does_not_crash(client):
    data = _with_fixture_file(_valid_form())
    response = client.post("/validate", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    assert b"Sprint 24" in response.data


def test_re_rendered_form_preserves_submitted_values(client):
    data = _with_dummy_file(_valid_form(target_value="-1", num_simulations="42"))
    response = client.post("/validate", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    assert b'value="42"' in response.data
