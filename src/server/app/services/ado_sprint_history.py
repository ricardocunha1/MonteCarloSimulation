"""Azure DevOps read for the Monte Carlo tool: the resolved User Stories and
Bugs under an Iteration path, normalized into the rows /api/validate turns
into a sprint summary. Reuses the Release Plan ADO helpers (`ado_backlog`)
for the connection, path matching, field checks, WIQL and batch fetching."""

import math
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import pandas as pd

from .ado_backlog import CAP_REACHED, WIQL_TOP, connect, fetch_items, field_exists, find_path, is_id, query_ids, utf8_text
from .ado_client import UNEXPECTED_RESPONSE, AdoClient, AdoError, is_utf8_text
from .ado_url import AdoProject
from .data_processing import COMPLETED_STATES

STORY_POINTS_FIELD = "Microsoft.VSTS.Scheduling.StoryPoints"
RESOLVED_DATE_FIELD = "Microsoft.VSTS.Common.ResolvedDate"
CLOSED_DATE_FIELD = "Microsoft.VSTS.Common.ClosedDate"
CHANGED_DATE_FIELD = "System.ChangedDate"
SPRINT_HISTORY_FIELDS = (
    "System.Id",
    "System.WorkItemType",
    "System.Title",
    "System.State",
    "System.IterationPath",
    CHANGED_DATE_FIELD,
)
# Date fields in fallback order for `resolvedDate`.
DATE_FIELDS = (RESOLVED_DATE_FIELD, CLOSED_DATE_FIELD, CHANGED_DATE_FIELD)
SPRINT_HISTORY_TYPES = ("User Story", "Bug")

ITERATION_PATH_REQUIRED = "Choose an Iteration path."
STORY_POINTS_FIELD_MISSING = f"The field {STORY_POINTS_FIELD} does not exist in this project; story points are 0."


def iteration_path_errors(data: Mapping[str, Any]) -> list[str]:
    """The sprint history request's own check: `iterationPath` must be a
    non-blank string."""
    path = data.get("iterationPath")
    if not isinstance(path, str) or not path.strip():
        return [ITERATION_PATH_REQUIRED]
    return []


def no_items_message(path: str) -> str:
    return f"No resolved User Stories or Bugs were found under Iteration path: {path}."


def wiql_query(path: str) -> str:
    """The sprint history WIQL from the API contract, with single quotes in
    `path` doubled."""
    escaped = path.replace("'", "''")
    types = ",".join(f"'{t}'" for t in SPRINT_HISTORY_TYPES)
    states = ",".join(f"'{s}'" for s in COMPLETED_STATES)
    return (
        "SELECT [System.Id] FROM WorkItems\n"
        "WHERE [System.TeamProject] = @project\n"
        f"  AND [System.WorkItemType] IN ({types})\n"
        f"  AND [System.State] IN ({states})\n"
        f"  AND [System.IterationPath] UNDER '{escaped}'\n"
        "ORDER BY [System.Id]"
    )


async def fetch_sprint_history(client: AdoClient, ado_project: AdoProject, iteration_path: str) -> dict:
    """Fetch the resolved User Stories and Bugs under an Iteration path.

    Same flow as `fetch_backlog`: `connect` (validates the PAT and gives the
    Iteration tree), the optional field checks, the WIQL query, then
    `workitemsbatch` in chunks. `iteration_path` is matched case-insensitively
    against the tree (the root included) and the tree's spelling is used from
    then on. Items are re-filtered on type and COMPLETED_STATES in case ADO
    returns more than the query asked for.

    Returns:
        The `/api/ado/sprint-history` payload (see the API contract): work
        items in ascending id order and any warnings.

    Raises:
        AdoError: "Unknown Iteration path: …" for a path outside the tree,
            the no-items message when nothing matches, UNEXPECTED_RESPONSE
            for a malformed ADO payload, or any error from `connect` / the
            client.
    """
    connection = await connect(client, ado_project)
    project_segment = quote(connection["project"]["name"], safe="")
    path = find_path(connection["iterations"], iteration_path.strip())
    if path is None:
        raise AdoError(f"Unknown Iteration path: {iteration_path.strip()}.")

    warnings: list[str] = []
    fields = list(SPRINT_HISTORY_FIELDS)
    if await field_exists(client, STORY_POINTS_FIELD):
        fields.append(STORY_POINTS_FIELD)
    else:
        warnings.append(STORY_POINTS_FIELD_MISSING)
    for date_field in (RESOLVED_DATE_FIELD, CLOSED_DATE_FIELD):
        if await field_exists(client, date_field):
            fields.append(date_field)

    ids = await query_ids(client, project_segment, wiql_query(path))
    if len(ids) >= WIQL_TOP:
        warnings.append(CAP_REACHED)

    items: dict[int, dict] = {}
    fetched = await fetch_items(client, project_segment, list(dict.fromkeys(ids)), fields, normalize_sprint_item)
    for item in fetched:
        if item["type"] in SPRINT_HISTORY_TYPES and item["state"] in COMPLETED_STATES:
            items.setdefault(item["id"], item)
    if not items:
        raise AdoError(no_items_message(path))

    return {
        "project": connection["project"],
        "projectUrl": connection["projectUrl"],
        "iterationPath": path,
        "fetchedAt": _utc_now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "workItems": [items[item_id] for item_id in sorted(items)],
        "warnings": warnings,
    }


def normalize_sprint_item(raw: Any) -> dict | None:
    """One `workitemsbatch` entry → an AdoSprintHistoryItem dict.

    Text fields are handled like `normalize_work_item`. `resolvedDate` is the
    first parseable date of DATE_FIELDS as UTC `YYYY-MM-DDTHH:MM:SSZ`;
    `storyPoints` is the field's number as ADO returns it, 0 when missing or
    not a finite number.

    Returns:
        The item dict, or None for an omitted (null) entry or one without any
        parseable date.

    Raises:
        AdoError: UNEXPECTED_RESPONSE for an entry that is not an object, has
            no `fields` object or no positive integer `id`.
    """
    if raw is None:
        return None
    fields = raw.get("fields") if isinstance(raw, dict) else None
    item_id = raw.get("id") if isinstance(raw, dict) else None
    if not isinstance(fields, dict) or not is_id(item_id):
        raise AdoError(UNEXPECTED_RESPONSE)
    resolved = next((d for d in (utc_iso(fields.get(name)) for name in DATE_FIELDS) if d is not None), None)
    if resolved is None:
        return None
    return {
        "id": item_id,
        "type": utf8_text(fields.get("System.WorkItemType")),
        "title": utf8_text(fields.get("System.Title")),
        "state": utf8_text(fields.get("System.State")),
        "iterationPath": utf8_text(fields.get("System.IterationPath")),
        "resolvedDate": resolved,
        "storyPoints": _story_points(fields.get(STORY_POINTS_FIELD)),
    }


def utc_iso(value: Any) -> str | None:
    """An ISO 8601 date/time string as UTC `YYYY-MM-DDTHH:MM:SSZ` (no offset
    = UTC), or None when it is not one."""
    if not is_utf8_text(value) or not value.strip():
        return None
    try:
        parsed = pd.to_datetime(value.strip(), utc=True, format="ISO8601")
    except (ValueError, TypeError, OverflowError):
        return None
    if pd.isna(parsed):
        return None
    return parsed.strftime("%Y-%m-%dT%H:%M:%SZ")


def _story_points(value: Any) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    if isinstance(value, float) and not math.isfinite(value):
        return 0
    return value


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)
