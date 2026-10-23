import json

import pandas as pd
import pytest

from conftest import FIXTURE_PATH


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


def _dummy_file():
    return {"sprint_history_file": ("sample.xlsx", b"dummy")}


def _fixture_file():
    return {"sprint_history_file": ("Sprint_History.xlsx", FIXTURE_PATH.read_bytes())}


def _post(client, data, files=None):
    return client.post("/api/validate", data=data, files=files)


def test_missing_file_returns_error(client):
    # A dummy non-file field forces a multipart body even without a file.
    response = _post(client, _valid_form(), files={"_": (None, "")})
    assert response.status_code == 422
    assert "A Sprint History Excel file is required." in response.json()["errors"]


def test_empty_file_input_returns_error(client):
    # What a browser sends for an untouched <input type="file">.
    response = _post(client, _valid_form(), files={"sprint_history_file": ("", b"")})
    assert response.status_code == 422
    assert "A Sprint History Excel file is required." in response.json()["errors"]


def test_too_many_simulations_returns_error(client):
    response = _post(client, _valid_form(num_simulations="20001"), _dummy_file())
    assert response.status_code == 422
    assert response.json()["errors"] == ["Number of Simulations must not exceed 20000."]


def test_negative_target_value_returns_error(client):
    response = _post(client, _valid_form(target_value="-1"), _dummy_file())
    assert response.status_code == 422
    assert response.json()["errors"] == ["Target Value must be a positive number."]


def test_negative_sprint_length_returns_error(client):
    response = _post(client, _valid_form(sprint_length="-10"), _dummy_file())
    assert response.status_code == 422
    assert response.json()["errors"] == ["Sprint Length must be a positive number."]


def test_invalid_date_returns_error(client):
    response = _post(client, _valid_form(sprint_start_date="not-a-date"), _dummy_file())
    assert response.status_code == 422
    assert response.json()["errors"] == ["Sprint Start Date must be a valid date."]


def test_negative_team_capacity_factor_returns_error(client):
    response = _post(client, _valid_form(team_capacity_factor="-1.0"), _dummy_file())
    assert response.status_code == 422
    assert response.json()["errors"] == ["Team Capacity Factor must be a positive number."]


def test_multiple_errors_are_all_reported(client):
    response = _post(
        client, _valid_form(target_value="-1", num_simulations="0"), _dummy_file()
    )
    assert response.status_code == 422
    assert response.json()["errors"] == [
        "Target Value must be a positive number.",
        "Number of Simulations must be a positive whole number.",
    ]


def test_non_excel_file_reports_parsing_error(client):
    files = {"sprint_history_file": ("bad.xlsx", b"not an excel file")}
    response = _post(client, _valid_form(), files)
    assert response.status_code == 422
    [error] = response.json()["errors"]
    assert error.startswith("Could not read Excel file")


def test_blank_team_capacity_factor_does_not_error(client):
    response = _post(client, _valid_form(team_capacity_factor=""), _fixture_file())
    assert response.status_code == 200
    assert len(response.json()["summary"]) == 24


def test_valid_params_return_fixture_summary_and_params(client):
    response = _post(client, _valid_form(), _fixture_file())
    assert response.status_code == 200
    body = response.json()

    summary = body["summary"]
    assert len(summary) == 24
    by_sprint = {record["Sprint"]: record for record in summary}
    assert by_sprint["Sprint 24"]["In Sampling Pool"] is False
    assert sum(record["In Sampling Pool"] for record in summary) == 23
    assert set(summary[0]) == {
        "Sprint",
        "Items Resolved",
        "Story Points",
        "Last Resolved Date",
        "Recency Rank",
        "In Sampling Pool",
    }

    assert body["params"]["target_value"] == "5"
    assert body["params"]["exclude_latest_sprints"] == "1"
    assert body["params"]["skip_validation"] is False


def test_skip_validation_is_echoed_in_params(client):
    response = _post(client, _valid_form(skip_validation="on"), _fixture_file())
    assert response.status_code == 200
    assert response.json()["params"]["skip_validation"] is True


# --- Azure DevOps sprint history (`sprint_history_items`) -----------------------------


def _fixture_as_ado_items() -> list[dict]:
    """The fixture rows as /api/ado/sprint-history work items (dates as UTC)."""
    df = pd.read_excel(FIXTURE_PATH)
    return [
        {
            "id": int(row["ID"]),
            "type": row["Work Item Type"],
            "title": row["Title"],
            "state": row["State"],
            "iterationPath": row["Iteration Path"],
            "resolvedDate": row["Resolved Date"].strftime("%Y-%m-%dT%H:%M:%SZ"),
            "storyPoints": None if pd.isna(row["Story Points"]) else row["Story Points"],
        }
        for row in df.to_dict(orient="records")
    ]


def _items_form(items, **overrides):
    raw = items if isinstance(items, str) else json.dumps(items)
    return _valid_form(sprint_history_items=raw, **overrides)


def test_items_summary_matches_the_excel_path(client):
    excel = _post(client, _valid_form(), _fixture_file())
    ado = _post(client, _items_form(_fixture_as_ado_items()), files={"_": (None, "")})
    assert ado.status_code == 200, ado.text
    assert ado.json() == excel.json()
    assert len(ado.json()["summary"]) == 24
    assert "sprint_history_items" not in ado.json()["params"]


def test_items_replace_an_uploaded_file(client):
    response = _post(client, _items_form(_fixture_as_ado_items()), files={"sprint_history_file": ("bad.xlsx", b"junk")})
    assert response.status_code == 200
    assert len(response.json()["summary"]) == 24


def test_blank_items_fall_back_to_the_file_requirement(client):
    response = _post(client, _items_form("   "), files={"_": (None, "")})
    assert response.status_code == 422
    assert response.json()["errors"] == ["A Sprint History Excel file is required."]


@pytest.mark.parametrize(
    "items, message",
    [
        ("not json", "The Azure DevOps sprint history is invalid."),
        ('{"workItems": []}', "The Azure DevOps sprint history is invalid."),
        ([{"state": "Done", "iterationPath": "P\\S"}], "The Azure DevOps sprint history is invalid."),
        (
            [{"state": "Done", "iterationPath": "P\\S", "resolvedDate": "yesterday", "storyPoints": 1}],
            "The Azure DevOps sprint history is invalid.",
        ),
        ([], "The Azure DevOps sprint history has no work items."),
    ],
)
def test_invalid_items_return_error(client, items, message):
    response = _post(client, _items_form(items), files={"_": (None, "")})
    assert response.status_code == 422
    assert response.json()["errors"] == [message]


def test_items_errors_are_reported_with_parameter_errors(client):
    response = _post(client, _items_form([], target_value="-1", num_simulations="0"), files={"_": (None, "")})
    assert response.status_code == 422
    assert response.json()["errors"] == [
        "The Azure DevOps sprint history has no work items.",
        "Target Value must be a positive number.",
        "Number of Simulations must be a positive whole number.",
    ]


def test_valid_items_with_parameter_errors_report_only_those(client):
    response = _post(client, _items_form(_fixture_as_ado_items(), sprint_length="0"), files={"_": (None, "")})
    assert response.status_code == 422
    assert response.json()["errors"] == ["Sprint Length must be a positive number."]


def test_items_larger_than_one_megabyte_are_accepted(client):
    items = [
        {
            "id": i,
            "title": "x" * 200,
            "state": "Done",
            "iterationPath": f"P\\Sprint {i % 10:02d}",
            "resolvedDate": f"2026-01-{i % 10 + 1:02d}T00:00:00Z",
            "storyPoints": 1,
        }
        for i in range(1, 6001)
    ]
    form = _items_form(items)
    assert len(form["sprint_history_items"]) > 1024 * 1024
    response = _post(client, form, files={"_": (None, "")})
    assert response.status_code == 200, response.text
    assert sum(record["Items Resolved"] for record in response.json()["summary"]) == 6000
