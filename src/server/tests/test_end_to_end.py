import re
import time

from conftest import FIXTURE_PATH


def _acceptance_form():
    return {
        "target_type": "Items Resolved",
        "target_value": "5",
        "num_simulations": "1000",
        "exclude_latest_sprints": "1",
        "sprint_start_date": "2026-07-11",
        "sprint_length": "10",
    }


def test_readme_acceptance_scenario_end_to_end(client):
    validate_response = client.post(
        "/api/validate",
        data=_acceptance_form(),
        files={"sprint_history_file": ("Sprint_History.xlsx", FIXTURE_PATH.read_bytes())},
    )
    assert validate_response.status_code == 200
    validated = validate_response.json()

    by_sprint = {record["Sprint"]: record for record in validated["summary"]}
    assert len(by_sprint) == 24
    assert by_sprint["Sprint 24"]["In Sampling Pool"] is False

    # The client sends the validate response straight back.
    simulate_response = client.post("/api/simulate", json=validated)
    assert simulate_response.status_code == 200
    rows = simulate_response.json()["rows"]

    assert [row["confidence"] for row in rows] == [50, 70, 85, 95]
    sprint_counts = [row["sprints"] for row in rows]
    assert sprint_counts == sorted(sprint_counts)

    for row in rows:
        if row["exceeds_window"]:
            assert row["sprints"] == 51
            assert row["completion_date"] is None
        else:
            assert re.match(r"^\d{4}-\d{2}-\d{2}$", row["completion_date"])


def _simulate_payload(summary_records, num_simulations: int) -> dict:
    return {
        "summary": summary_records,
        "params": {
            "target_type": "Items Resolved",
            "target_value": "5",
            "num_simulations": str(num_simulations),
            "sprint_start_date": "2026-07-11",
            "sprint_length": "10",
        },
    }


def test_simulate_performance_1000_simulations(client, fixture_summary_records):
    start = time.perf_counter()
    response = client.post("/api/simulate", json=_simulate_payload(fixture_summary_records, 1000))
    elapsed = time.perf_counter() - start

    assert response.status_code == 200
    assert elapsed < 2.0, f"/api/simulate took {elapsed:.2f}s for 1000 simulations (limit 2s)"


def test_simulate_performance_5000_simulations(client, fixture_summary_records):
    start = time.perf_counter()
    response = client.post("/api/simulate", json=_simulate_payload(fixture_summary_records, 5000))
    elapsed = time.perf_counter() - start

    assert response.status_code == 200
    assert elapsed < 5.0, f"/api/simulate took {elapsed:.2f}s for 5000 simulations (limit 5s)"
