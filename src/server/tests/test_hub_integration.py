"""Integration tests for the CM Estimations Hub rename and the upload-buffering fix.

These go through the real FastAPI app (TestClient, real multipart upload of the
canonical fixture) rather than calling services directly.
"""

from conftest import FIXTURE_PATH


def _form(**overrides):
    form = {
        "target_type": "Story Points",
        "target_value": "200",
        "num_simulations": "500",
        "exclude_latest_sprints": "1",
        "sprint_start_date": "2026-07-13",
        "sprint_length": "10",
        "team_capacity_factor": "1.0",
    }
    form.update(overrides)
    return form


def test_openapi_title_is_cm_estimations_hub(client):
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "CM Estimations Hub API"


def test_api_paths_are_unchanged(client):
    paths = client.get("/openapi.json").json()["paths"]

    assert {"/api/validate", "/api/simulate", "/api/health"} <= set(paths)


def test_validate_with_fixture_upload_then_simulate_story_points(client):
    validate_response = client.post(
        "/api/validate",
        data=_form(),
        files={"sprint_history_file": ("Sprint_History.xlsx", FIXTURE_PATH.read_bytes())},
    )
    assert validate_response.status_code == 200
    validated = validate_response.json()
    assert len(validated["summary"]) == 24
    assert sum(1 for record in validated["summary"] if record["In Sampling Pool"]) == 23

    simulate_response = client.post("/api/simulate", json=validated)

    assert simulate_response.status_code == 200
    body = simulate_response.json()
    assert body["target_type"] == "Story Points"
    assert body["target_value"] == 200
    assert body["histogram"]["labels"][-1] == ">50"
    assert sum(body["histogram"]["counts"]) == 500


def test_validate_rejects_non_excel_upload_with_errors_shape(client):
    response = client.post(
        "/api/validate",
        data=_form(),
        files={"sprint_history_file": ("Sprint_History.xlsx", b"not an excel workbook")},
    )

    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"errors"}
    assert len(body["errors"]) == 1
    assert body["errors"][0].startswith("Could not read Excel file")


def test_validate_rejects_empty_upload_with_errors_shape(client):
    response = client.post(
        "/api/validate",
        data=_form(),
        files={"sprint_history_file": ("Sprint_History.xlsx", b"")},
    )

    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"errors"}
    assert all(isinstance(message, str) and message for message in body["errors"])


def _large_valid_workbook() -> bytes:
    """The fixture plus an incompressible extra column, so the .xlsx exceeds
    Starlette's 1 MB in-memory spool threshold and is rolled over to disk."""
    import io
    import secrets

    import pandas as pd

    df = pd.read_excel(FIXTURE_PATH, sheet_name=0)
    df["Padding"] = [secrets.token_hex(4096) for _ in range(len(df))]
    out = io.BytesIO()
    df.to_excel(out, index=False)
    return out.getvalue()


def test_upload_larger_than_spool_threshold_is_parsed(client):
    workbook = _large_valid_workbook()
    assert len(workbook) > 1024 * 1024

    response = client.post(
        "/api/validate",
        data=_form(),
        files={"sprint_history_file": ("Sprint_History.xlsx", workbook)},
    )

    assert response.status_code == 200
    summary = response.json()["summary"]
    assert len(summary) == 24
    assert sum(1 for record in summary if record["In Sampling Pool"]) == 23


def test_corrupt_upload_larger_than_spool_threshold_is_a_422(client):
    padded = FIXTURE_PATH.read_bytes() + b"\0" * (2 * 1024 * 1024)

    response = client.post(
        "/api/validate",
        data=_form(),
        files={"sprint_history_file": ("Sprint_History.xlsx", padded)},
    )

    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"errors"}
    assert body["errors"][0].startswith("Could not read Excel file")
