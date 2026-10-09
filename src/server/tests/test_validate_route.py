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
