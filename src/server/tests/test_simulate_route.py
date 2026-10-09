import pytest


@pytest.fixture()
def payload(fixture_summary_records):
    def build(**param_overrides):
        params = {
            "target_type": "Items Resolved",
            "target_value": "5",
            "num_simulations": "1000",
            "sprint_start_date": "2026-07-11",
            "sprint_length": "10",
        }
        params.update(param_overrides)
        return {"summary": fixture_summary_records, "params": params}

    return build


def test_simulate_returns_percentile_rows(client, payload):
    response = client.post("/api/simulate", json=payload())

    assert response.status_code == 200
    body = response.json()
    assert body["target_type"] == "Items Resolved"
    assert body["target_value"] == 5
    assert [row["confidence"] for row in body["rows"]] == [50, 70, 85, 95]
    assert [row["label"] for row in body["rows"]] == [
        "Optimistic",
        "Likely",
        "Confident",
        "Safe Target",
    ]


def test_simulate_returns_histogram_with_overflow_bucket(client, payload):
    body = client.post("/api/simulate", json=payload()).json()

    histogram = body["histogram"]
    assert len(histogram["labels"]) == 51  # sprints 1..50 plus a ">50" bucket
    assert histogram["labels"][-1] == ">50"
    assert len(histogram["counts"]) == 51
    assert sum(histogram["counts"]) == 1000  # matches num_simulations


def test_team_capacity_factor_scales_items_resolved_before_simulating(client, payload):
    # The fixture's sampling pool has a minimum of 2 "Items Resolved" per
    # sprint; scaling by a factor of 10 guarantees every single draw clears
    # a target of 5, so every simulated run hits the target in sprint 1.
    body = client.post("/api/simulate", json=payload(team_capacity_factor="10")).json()

    assert body["histogram"]["counts"][0] == 1000
    assert sum(body["histogram"]["counts"][1:]) == 0


def test_unreachable_target_renders_sentinel_rows(client, payload):
    body = client.post("/api/simulate", json=payload(target_value="1000000")).json()

    for row in body["rows"]:
        assert row["sprints"] == 51
        assert row["exceeds_window"] is True
        assert row["completion_date"] is None
    assert body["histogram"]["counts"][-1] == 1000


def test_empty_sampling_pool_returns_error(client, payload):
    request = payload()
    for record in request["summary"]:
        record["In Sampling Pool"] = False

    response = client.post("/api/simulate", json=request)

    assert response.status_code == 422
    assert response.json()["errors"] == [
        "No sprints are available in the sampling pool. Adjust 'Exclude "
        "Latest Sprints from Sampling' or upload more sprint history."
    ]


def test_bad_params_return_could_not_run_simulation(client, payload):
    response = client.post("/api/simulate", json=payload(sprint_start_date="nope"))

    assert response.status_code == 422
    [error] = response.json()["errors"]
    assert error.startswith("Could not run simulation: ")


def test_numeric_params_are_accepted(client, payload):
    response = client.post(
        "/api/simulate", json=payload(target_value=5, num_simulations=200, sprint_length=10)
    )
    assert response.status_code == 200
    assert sum(response.json()["histogram"]["counts"]) == 200


def test_malformed_body_returns_errors_shape(client):
    response = client.post("/api/simulate", json={"params": {}})

    assert response.status_code == 422
    [error] = response.json()["errors"]
    assert error.startswith("Invalid request: body.summary")
