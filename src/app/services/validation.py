from datetime import datetime

from werkzeug.datastructures import FileStorage

VALID_TARGET_TYPES = {"Items Resolved", "Story Points"}
MAX_SIMULATIONS = 20000


def validate_parameters(form, file: FileStorage | None) -> list[str]:
    """Validate the Data Input parameters per specs/data_validation.md.

    Excel *content* validation (worksheet/column checks) happens later in
    the pipeline (data_processing.parse_sprint_history) since it requires
    actually reading the file.
    """
    errors: list[str] = []

    if file is None or file.filename == "":
        errors.append("A Sprint History Excel file is required.")

    target_type = form.get("target_type", "")
    if target_type not in VALID_TARGET_TYPES:
        errors.append('Target Type must be either "Items Resolved" or "Story Points".')

    if _parse_positive_number(form.get("target_value")) is None:
        errors.append("Target Value must be a positive number.")

    num_simulations = _parse_positive_int(form.get("num_simulations"))
    if num_simulations is None:
        errors.append("Number of Simulations must be a positive whole number.")
    elif num_simulations > MAX_SIMULATIONS:
        errors.append(f"Number of Simulations must not exceed {MAX_SIMULATIONS}.")

    if not _is_valid_date(form.get("sprint_start_date", "")):
        errors.append("Sprint Start Date must be a valid date.")

    if _parse_positive_number(form.get("sprint_length")) is None:
        errors.append("Sprint Length must be a positive number.")

    exclude_latest = form.get("exclude_latest_sprints", "")
    if exclude_latest and _parse_non_negative_int(exclude_latest) is None:
        errors.append(
            "Exclude Latest Sprints from Sampling must be a non-negative whole number."
        )

    team_capacity_factor = form.get("team_capacity_factor", "")
    if team_capacity_factor and _parse_positive_number(team_capacity_factor) is None:
        errors.append("Team Capacity Factor must be a positive number.")

    return errors


def _parse_positive_number(raw) -> float | None:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _parse_positive_int(raw) -> int | None:
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _parse_non_negative_int(raw) -> int | None:
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value >= 0 else None


def _is_valid_date(raw: str) -> bool:
    if not raw:
        return False
    try:
        datetime.strptime(raw, "%Y-%m-%d")
    except ValueError:
        return False
    return True
